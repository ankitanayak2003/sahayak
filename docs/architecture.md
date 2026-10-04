# Sahayak — System Architecture & Technical Specifications

## 1. System Topology Overview

Sahayak is built with a decoupled architecture separating a responsive Single-Page Application (SPA) from a modular Node.js backend, high-performance database tier, distributed cache/rate-limiter, and conversational voice pipelines.

```
                              +---------------------------------------+
                              |   Vercel Global Edge Network          |
                              |   (React 19 + TypeScript + Vite)      |
                              |   Directory: 'fornent end'            |
                              +-------------------+-------------------+
                                                  |
                                                  | HTTPS / REST API
                                                  v
+------------------------+  HTTPS / WSS   +-----------------------------------+
| Exotel PSTN Telephony  | -------------> | Sahayak Backend Service           |
| (Carrier Inbound Calls)| <------------- | (Node.js 20 Express Monolith)     |
+------------------------+                +-----------------+-----------------+
                                                            |
                       +------------------------------------+------------------------------------+
                       |                                    |                                    |
                       v                                    v                                    v
        +------------------------------+     +------------------------------+     +------------------------------+
        | MongoDB Atlas                |     | Redis 7 / Upstash            |     | LiveKit Cloud + Gemini AI    |
        | - assistance_requests        |     | - Keyed HMAC OTP Store       |     | - Conversational Voice Agent |
        | - users                      |     | - Distributed Lua Limiters   |     | - Real-time WebRTC Streaming |
        | - volunteers                 |     | - Atomic Attempt Locks       |     | - STT / TTS Audio Processing |
        | - refresh_tokens             |     +------------------------------+     +------------------------------+
        +------------------------------+
```

---

## 2. Frontend Architecture (`fornent end/`)

* **Framework & Tooling**: React 19, TypeScript 5.7, Vite 8, Tailwind CSS v4.
* **Navigation & Routing**: Client-side state routing with role-guarded views (`AppContext.tsx`).
* **Map & Spatial Visualization**:
  * **Engine**: Leaflet 1.9.4 with OpenStreetMap raster tiles.
  * **Component**: `<IncidentMap />` renders animated radar beacon, circular accuracy radius, interactive tooltips, and one-click Google Maps driving navigation routing.
  * **Zero External API Keys**: OpenStreetMap tile layer eliminates API key exposure in client bundles.
* **Authentication State Management**:
  * Dual-token model stored in browser storage (`localStorage`):
    * `sahayak_access_token`: Short-lived JWT (15-minute validity).
    * `sahayak_refresh_token`: Cryptographically secure random token (30-day validity).
  * Auto-refresh interceptor rotates refresh tokens transparently on HTTP 401.

---

## 3. Backend Architecture (`src/`)

### 3.1 HTTP & API Gateway
* **Core Framework**: Express 4.19 running on Node.js 20+.
* **API Routing**: Root prefix `/api/v1` managing modular sub-routers:
  * `/auth`: Registration, login, token refresh, logout.
  * `/volunteers`: Onboarding, OTP verification, verification status.
  * `/requests`: Public citizen SOS intake, incident triage, lifecycle transitions.
  * `/emergencies`: Escalation management and audit events.
  * `/voice` & `/sarvam`: Inbound carrier webhooks and hosted AI tool actions.
* **Orchestrator Probes**:
  * `GET /health/live`: Lightweight process liveness check.
  * `GET /health/ready`: Deep dependency readiness check verifying live MongoDB ping and Redis socket connectivity. Returns HTTP 503 if any required service is offline.
  * `GET /health`: Backward-compatible legacy health monitoring.

### 3.2 Security & Abuse Prevention
* **Redis-Backed Distributed OTP (`src/utils/otpService.js`)**:
  * Generates cryptographically secure 6-digit OTPs.
  * Computes HMAC-SHA256 hash using `PHONE_BLIND_INDEX_SECRET` or `JWT_SECRET`.
  * Plaintext OTP is **never** written to database or cache.
  * Atomic Redis Lua script (`VERIFY_OTP_LUA`) checks match, increments attempts, and enforces single-use purge on success or after 5 failed attempts.
* **Distributed Rate Limiting (`src/middleware/rateLimiter.js`)**:
  * Atomic Lua script evaluates fixed-window request limits in a single roundtrip.
  * Respects Express `req.ip` via `TRUST_PROXY` configuration; rejects unvalidated spoofed proxy headers.
  * Returns HTTP 429 with standard headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After`.
  * Fail-closed architecture (HTTP 503) in production when Redis is required but unreachable.
* **Phone Number Privacy & Encryption (`src/utils/phoneSecurity.js`)**:
  * **Reversible Authenticated Encryption**: AES-256-GCM authenticated cipher with unique 12-byte initialization vectors (IV).
  * **Blind Index Search**: HMAC-SHA256 blind index allowing exact-match database queries without decrypting phone numbers.

---

## 4. Database Schema & Data Models (MongoDB Atlas)

### `assistance_requests`
Primary record for emergency incidents and community aid requests:
```javascript
{
  _id: ObjectId("..."),
  request_id: ObjectId("..."),
  category: "medical",           // medical | fall | groceries | companionship | transport | other
  urgency_level: "critical",     // routine | urgent | critical
  is_emergency: true,
  description: "Citizen SOS report: Severe breathing difficulty.",
  location_text: "12th Main Road, HAL 2nd Stage, Indiranagar",
  latitude: 12.9716,            // WGS84 coordinate
  longitude: 77.6412,           // WGS84 coordinate
  accuracy_meters: 15.2,        // GPS accuracy radius in meters
  location_source: "browser_gps", // browser_gps | manual_pin | caller_provided
  location_captured_at: ISODate("..."),
  location_geojson: {
    type: "Point",
    coordinates: [77.6412, 12.9716] // [longitude, latitude] for 2dsphere indexing
  },
  senior_citizen_id: ObjectId("...") | null,
  senior_citizen_phone: "919876543210",
  source_channel: "citizen_web", // citizen_web | voice_call | app
  status: "assigned",           // pending_assignment | assigned | accepted | in_progress | completed | cancelled | escalated_to_112
  current_assigned_volunteer_id: ObjectId("...") | null,
  queue_position: null,
  created_by: "citizen",
  created_at: ISODate("..."),
  updated_at: ISODate("...")
}
```

### `users`
Accounts for system administrators and field volunteers:
```javascript
{
  _id: ObjectId("..."),
  name: "John Doe",
  email: "john@volunteer.org",
  password_hash: "$2b$10$...",
  phone_number_encrypted: "{\"iv\":\"...\",\"ciphertext\":\"...\",\"tag\":\"...\"}",
  phone_number_blind_index: "d83f...",
  role: "volunteer",            // volunteer | police_admin
  account_status: "active",     // pending | active | suspended
  created_at: ISODate("..."),
  updated_at: ISODate("...")
}
```

### `volunteers`
Workload and availability profiles linked to volunteer users:
```javascript
{
  _id: ObjectId("..."),
  user_id: ObjectId("..."),
  verification_status: "verified", // pending | verified | rejected
  is_available: true,
  active_assignments_count: 0,
  created_at: ISODate("..."),
  updated_at: ISODate("...")
}
```

### `refresh_tokens`
Cryptographically rotated token store for session continuity:
```javascript
{
  _id: ObjectId("..."),
  user_id: ObjectId("..."),
  token_hash: "8fbc9...",      // HMAC-SHA256 hash of random token
  expires_at: ISODate("..."),
  revoked: false,
  created_at: ISODate("...")
}
```

---

## 5. Automated Dispatch & Queue Engine (`src/services/volunteerAssignmentService.js`)

When an incident is created:
1. **Candidate Selection**:
   Queries `volunteers` collection where `verification_status === 'verified'` and `is_available === true`.
2. **Workload Balancing**:
   Calculates active uncompleted assignments for each eligible volunteer.
3. **Deterministic Selection**:
   * Sorts candidate volunteers ascending by active assignment count.
   * If counts are equal, sorts by earliest creation timestamp.
4. **Queue Management**:
   If no volunteer has capacity (e.g. all available volunteers are at maximum capacity), the incident is marked `status: 'pending_assignment'` and assigned a numerical `queue_position`. As active assignments complete, queued incidents are automatically promoted.

---

## 6. Voice AI & Telephony Pipelines

1. **Exotel PSTN Gateway (`src/services/exotelVoiceGateway.js`)**:
   Receives telephone audio streams from inbound phone numbers and proxies audio bi-directionally via WebSockets.
2. **Sarvam Hosted Voice Agent (`src/services/sarvamVoiceAgentService.js`)**:
   Translates audio via Indian regional language STT/TTS and triggers structured emergency intake webhook `POST /api/v1/sarvam/emergency`.
3. **LiveKit Cloud Worker (`src/agents/livekit/agent.js`)**:
   Runs as an independent background worker connecting to LiveKit Cloud rooms for low-latency voice AI interaction with emergency callers.
