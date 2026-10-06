# Sahayak (सहायक) — Product Requirements Document (PRD)

## 1. Product Overview & Purpose

**Sahayak** (सहायक — "Helper/Assistant") is an intelligent, multi-channel emergency assistance and coordination platform engineered to protect senior citizens, vulnerable individuals, and citizens in acute distress.

During medical emergencies, falls, accidents, and life-threatening crises, victims often face severe physical and psychological barriers:
- Panic, acute pain, or disorientation that prevents navigating multi-step mobile apps.
- Cognitive and visual impairments common among elder citizens.
- Time-critical delays in traditional dispatch queues.
- Inability to articulate precise technical GPS coordinates or street addresses.

Sahayak addresses these challenges through an integrated, multi-modal emergency intake and response architecture:
1. **Zero-Friction Public Web SOS**: A single-tap emergency intake modal that captures distress reports instantly without requiring prior account registration or login.
2. **One-Click Geolocation Sharing**: Explicit, browser-native GPS capture (`navigator.geolocation`) that provides responders with exact latitude, longitude, and accuracy boundaries, with human-readable text address fallback.
3. **Conversational Voice AI & Telephony Intake**: Inbound phone call handling via Exotel PSTN gateway, streaming Indian regional language Speech-to-Text (STT) and Text-to-Speech (TTS) via Sarvam AI, and real-time conversational agents via LiveKit Cloud.
4. **Intelligent Triage & AI Disposition**: Incident severity analysis, urgency classification, and 112 escalation recommendations powered by Google Gemini AI (`@google/genai`).
5. **Deterministic Volunteer Dispatch**: Automated workload-balanced dispatch engine that instantly routes urgent requests to verified, nearby community volunteers with deterministic queue management.
6. **Command & Control Operations Center**: Comprehensive administrative portal for police dispatchers featuring real-time incident tracking, interactive Leaflet/OpenStreetMap geospatial visualization, volunteer vetting, and 112 emergency escalation.

---

## 2. Target Users & User Personas

| Persona | Role / Description | Primary Needs & Pain Points |
| :--- | :--- | :--- |
| **Senior Citizen / Citizen in Distress** | Elder or vulnerable person facing medical distress, fall, fire, or acute crisis. | Needs immediate help with zero cognitive friction. Cannot fill long forms or remember passwords. Needs automatic location sharing and spoken regional language support. |
| **Community Volunteer** | Vetted community responder registered to provide localized aid (first response, medical escort, groceries, companionship). | Needs immediate notification of nearby incidents, victim location with turn-by-turn driving navigation, clear task lifecycle controls, and protection against burnout via balanced workloads. |
| **Police Administrator / Dispatcher** | Emergency operations center officer overseeing incident triage across districts. | Needs holistic situational awareness, interactive incident map with visual beacons, emergency escalation audit logs, volunteer verification workflow, and manual dispatch override capabilities. |

---

## 3. Main User Roles & Permissions

Sahayak implements strict Role-Based Access Control (RBAC):

1. **Public Citizen (Unauthenticated)**:
   - Access: Emergency intake modal (`POST /api/v1/requests/citizen`).
   - Permissions: Submit SOS requests with description, category, optional phone, and optional GPS coordinates. Can track their submitted request status via returned request ID.
   - Boundaries: Cannot view other requests, cannot access volunteer rosters, cannot access administrative data.
2. **Community Volunteer (`volunteer`)**:
   - Access: Volunteer dashboard, request list, request details, profile, notifications.
   - Permissions: Toggle availability status (`is_available`), view assigned incidents, accept/reject assignments, transition assigned incidents (`accepted` ➔ `in_progress` ➔ `completed`), view GPS coordinates for assigned incidents.
   - Boundaries: Insecure Direct Object Reference (IDOR) protection strictly prevents accessing GPS coordinates or details of incidents not assigned to them. Cannot verify other volunteers or access admin routes.
3. **Police Administrator (`police_admin`)**:
   - Access: Admin dashboard, emergency triage center, incident map, volunteer verification queue, volunteer roster, audit history.
   - Permissions: Full district visibility of all incidents and coordinates, manual volunteer dispatch/reassignment, 112 emergency escalation, approval/rejection of pending volunteer applications, creation/management of admin accounts.

---

## 4. Core Features & Functional Specifications

### 4.1 Multi-Channel Emergency Intake
* **Public Citizen SOS Endpoint (`POST /api/v1/requests/citizen`)**:
  - No prior authentication required.
  - Input bounding: `description` (≤ 500 characters), `location_text` (≤ 200 characters), `category` (validated enum), `phone` (normalized to 10–15 digits).
  - Rate-limited to 10 submissions per 15 minutes per IP to prevent denial-of-service and false dispatch storms.
  - Immediate response with tracking ID and initial dispatch status without exposing internal responder details.
* **AI Urgency Classification (Google Gemini)**:
  - Automated analysis of incident description using `@google/genai`.
  - Determines urgency level (`routine`, `urgent`, `critical`).
  - Evaluates whether direct escalation to emergency services (112) is warranted.
  - Safe fallbacks ensure intake succeeds even if AI service latency occurs.

### 4.2 GPS & Interactive Incident Mapping
* **Browser Geolocation Capture**:
  - Explicit user consent requested via browser `navigator.geolocation.getCurrentPosition`.
  - Captures WGS84 decimal latitude, longitude, and accuracy radius in meters.
  - Human-readable text location fallback provided for non-GPS browsers or denied permissions.
* **Geospatial Data Contract & Validation**:
  - Validated centrally in `src/utils/locationValidation.js`.
  - Enforces atomic coordinate pairs: either both latitude and longitude are supplied, or neither is. Partial coordinates are rejected with HTTP 400.
  - Strict range checks: `-90 <= latitude <= 90`, `-180 <= longitude <= 180`, `accuracy_meters >= 0`.
  - Persisted with standard GeoJSON `Point` (`[longitude, latitude]`) on MongoDB `assistance_requests` collection with `2dsphere` spatial indexing.
* **Interactive Map Visualization (`IncidentMap.tsx`)**:
  - Powered by Leaflet 1.9.4 and OpenStreetMap raster tiles.
  - Zero external API keys required; zero client telemetry or per-request mapping fees.
  - Features dynamic animated radar beacon at incident location, translucent circular accuracy radius overlay, and incident metadata popup.
  - One-click deep-link to Google Maps driving navigation (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`).
* **IDOR Location Privacy**:
  - Incident coordinates are strictly classified as sensitive PII.
  - Unauthenticated endpoints cannot read coordinate data.
  - Volunteers can only view coordinates for incidents actively assigned to their volunteer ID.
  - Police administrators maintain authorized oversight.

### 4.3 Automated Volunteer Dispatch Engine
* **Deterministic Matching Algorithm (`volunteerAssignmentService.js`)**:
  1. Filters volunteer roster for verified volunteers (`verification_status === 'verified'`) with active availability (`is_available === true`).
  2. Ranks eligible candidates by current active workload (ascending order of active, uncompleted assignments).
  3. Breaks ties deterministically by earliest volunteer registration timestamp (`created_at`).
  4. If all eligible volunteers are currently occupied, incident is placed in queue with assigned `queue_position`.
  5. When an active volunteer completes or releases a task, queued incidents are automatically promoted and assigned.

### 4.4 Distributed Security & Anti-Abuse (Redis-Backed)
* **Redis Keyed HMAC-SHA256 OTP**:
  - Cryptographically secure 6-digit OTP generation with 5-minute TTL.
  - Plaintext OTP is **never** written to database or cache.
  - Stored as HMAC-SHA256 keyed hash (`crypto.createHmac('sha256', secret)`).
  - Atomic verification via Redis Lua script (`VERIFY_OTP_LUA`):
    - Validates hash match in a single atomic roundtrip.
    - Automatically purges key upon successful verification (single-use token).
    - Enforces strict 5-attempt lockout against brute-force attacks; deletes key on 5th failed attempt.
* **Distributed Rate Limiting**:
  - Atomic Redis Lua script fixed-window counters.
  - Evaluates client IP derived through `TRUST_PROXY` configuration.
  - Protects Citizen SOS (`POST /requests/citizen`), Volunteer OTP dispatch (`POST /volunteers/send-otp`), and Login (`POST /auth/login`).
  - Standard headers returned: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`.
  - Fail-closed architecture in production: returns HTTP 503 if Redis is unreachable when security is required.
* **Phone Number Encryption & Blind Indexing**:
  - Reversible authenticated encryption via AES-256-GCM (`phone_number_encrypted`).
  - Deterministic HMAC-SHA256 blind indexing (`phone_number_blind_index`) allowing fast duplicate detection and queries without decrypting raw phone numbers.

### 4.5 In-App Notifications
* Internal notification records persisted in MongoDB `notifications` collection.
* Automated triggers for dispatch assignment, volunteer rejection, and status lifecycle transitions.
* Frontend notification center with unread badge counter, dedicated notification view, and mark-as-read controls.

### 4.6 Conversational Voice AI Functionality (Implemented in Codebase)
* **Exotel Telephony Gateway (`src/services/exotelVoiceGateway.js`)**:
  - Handles incoming carrier audio streams via WebSocket on `/ws`.
  - Bidirectional 8kHz PCM linear audio frame exchange.
  - Basic Auth verification (`EXOTEL_WS_USERNAME` / `EXOTEL_WS_PASSWORD`).
  - DTMF emergency webhook intake on `/api/v1/voice/webhook`.
* **Sarvam AI Streaming Voice Agent (`src/services/sarvamVoiceAgentService.js`)**:
  - Real-time Speech-to-Text streaming via Sarvam `saaras:v3` WebSocket.
  - Real-time Text-to-Speech streaming via Sarvam `bulbul:v3` WebSocket.
  - Dedicated tool webhook intake endpoint: `POST /api/v1/sarvam/emergency` protected by Bearer token (`SARVAM_TOOL_SHARED_SECRET`).
* **LiveKit Cloud Conversational Worker (`src/agents/livekit/agent.js`)**:
  - Background worker connecting to LiveKit Cloud WebRTC rooms.
  - Conversational interaction with emergency callers powered by Google Gemini voice models.

---

## 5. End-to-End User Workflows

### 5.1 Citizen Emergency Workflow
```
[ Citizen ] ──> Clicks "Emergency SOS" ──> [ CitizenEmergencyModal ]
                        │
                        ├─► Grants Browser GPS (navigator.geolocation)
                        ├─► Selects Category (Medical, Fall, Fire, etc.)
                        ├─► Enters Brief Description & Optional Phone
                        │
                        ▼
             [ POST /api/v1/requests/citizen ] (Rate-Limited)
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
 [ Gemini AI Severity & Triage ]   [ MongoDB assistance_requests ]
        │                               │
        ▼                               ▼
 [ Deterministic Dispatch ]        [ Geospatial Point Indexing ]
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
(Volunteer Free)            (All Volunteers Busy)
   │                               │
   ▼                               ▼
[ Assigned & Notified ]     [ Placed in Queue (queue_position) ]
```

### 5.2 Community Volunteer Workflow
```
[ Volunteer Registration ] ──► [ Request Phone OTP ] ──► [ Enter OTP ]
                                                                │
                                                                ▼
                                                [ Verification Approved by Admin ]
                                                                │
                                                                ▼
                                                [ Sets Availability: Available ]
                                                                │
                                                                ▼
                                                [ Incident Dispatched Notification ]
                                                                │
                                                                ▼
                                                [ Views Request Details & Map ]
                                                                │
                                                ┌───────────────┴───────────────┐
                                                ▼                               ▼
                                           [ Accept ]                       [ Reject ]
                                                │                               │
                                                ▼                               ▼
                                      [ status: accepted ]             [ Auto-Reassigned ]
                                                │
                                                ▼
                                      [ Drives via Google Maps ]
                                                │
                                                ▼
                                      [ status: in_progress ]
                                                │
                                                ▼
                                      [ status: completed ]
```

### 5.3 Police Administrator Workflow
```
[ Admin Login ] ──► [ Admin Dashboard & Operations Center ]
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
[ Live Incident Triage ] [ Incident Map ]   [ Volunteer Management ]
       │                    │                    │
       ├─► Review Details   ├─► Radar Beacons   ├─► Verify Applications
       ├─► Escalate to 112  ├─► Accuracy Circles├─► Audit Workloads
       └─► Manual Reassign  └─► Driving Routes  └─► Availability Status
```

---

## 6. Current Project Scope & Boundary Definitions

### In Scope (Fully Implemented & Verified)
* Public citizen web emergency SOS modal with optional browser GPS and text address fallback.
* Police admin dashboard, triage list, incident details, and volunteer verification portal.
* Volunteer dashboard, assignment inbox, turn-by-turn navigation deep-links, and lifecycle task completion.
* Interactive Leaflet + OpenStreetMap mapping with animated beacons and accuracy circles.
* Google Gemini AI emergency triage and disposition classification.
* Exotel telephony audio WebSocket gateway and DTMF webhook intake.
* Sarvam AI regional language STT/TTS streaming integration and tool webhook.
* LiveKit Cloud voice agent background worker.
* Redis-backed HMAC-SHA256 OTP storage, atomic Lua verification, and brute-force lockout.
* Redis-backed distributed rate limiting with fail-closed production posture.
* Authenticated AES-256-GCM phone encryption and HMAC-SHA256 blind indexing.
* Dual-token JWT authentication (15-min access token + 30-day rotated refresh token).
* 165 automated backend tests and clean frontend production build.

### Explicitly Out of Scope
* **Direct SIP Trunk Routing & PBX Switching**: Telephony carrier routing is handled externally via Exotel PSTN. Direct SIP signalling, SIP registration, and asterisk softswitches are not implemented.
* **Physical IoT Hardware Distress Buttons**: Hardware device firmware or BLE wearable beacons.
* **Commercial In-App Payment Gateways**: Volunteer compensation or donation payment rails.
* **Carrier SMS Delivery in Local Development**: Plaintext OTP is returned in local responses for testing simplicity; live SMS dispatch requires production SMS provider credentials.
