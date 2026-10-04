# Sahayak — Product Requirements Document (PRD)

## 1. Product Overview & Purpose

**Sahayak** (सहायक — "Helper/Assistant") is an intelligent emergency assistance and coordination platform designed to protect and support senior citizens, vulnerable individuals, and citizens in distress.

When an emergency occurs, seniors and citizens often cannot navigate complex multi-step mobile apps. Sahayak bridges this critical gap through a multi-channel intake pipeline:
1. **Public Citizen Web SOS**: Fast, one-click emergency submission with optional real-time browser GPS coordinates, human-readable address fallback, and voice description.
2. **Telephony & Conversational Voice Agents**: Inbound PSTN phone calls through Exotel and Sarvam AI / LiveKit conversational voice agents that collect emergency details verbally in regional Indian languages.
3. **Dispatcher & Police Admin Portal**: Real-time triage dashboard with interactive incident maps (Leaflet + OpenStreetMap), urgency categorization, and escalation to emergency services (112).
4. **Community Volunteer Dispatch Network**: Automated, workload-balanced dispatch engine that matches urgent requests to verified, nearby volunteers.

---

## 2. Target Users & Personas

| Persona | Description | Primary Needs |
| :--- | :--- | :--- |
| **Citizen / Senior Citizen** | An elder or vulnerable citizen facing a medical emergency, fall, fire, or acute crisis. | Instant SOS without requiring prior login; automated location sharing; regional language voice support. |
| **Police Administrator / Dispatcher** | Emergency operations center personnel monitoring incoming incidents across districts. | Live triage view; incident map with visual beacons; 112 escalation tracking; volunteer audit logs. |
| **Community Volunteer** | Vetted first responder registered to provide localized aid (groceries, companionship, emergency first response). | Mobile-friendly request alerts; victim location map; task acceptance/completion lifecycle controls. |

---

## 3. Core Features & Capabilities

### 3.1 Emergency Intake & Classification
* **Public Citizen SOS (`POST /api/v1/requests/citizen`)**:
  * No prior authentication required.
  * Inputs bounded: description (≤ 500 chars), location text (≤ 200 chars), optional phone validated and normalized (10–15 digits).
  * Rate-limited to prevent dispatch flooding (10 submissions per 15 min per IP).
  * Automatic urgency classification (Routine, Urgent, Critical).
* **AI Urgency & Disposition Classification**:
  * Powered by Google Gemini (`@google/genai`).
  * Classifies incident severity, determines emergency escalation requirement, and extracts structured incident tags.
  * Robust input bounding and fallback defaults to prevent classification failures from halting intake.
* **Conversational Voice AI**:
  * Telephony routing via Exotel PSTN gateway.
  * Sarvam AI real-time Speech-to-Text (STT) and Text-to-Speech (TTS) for Indian languages.
  * LiveKit Voice Agent worker for low-latency conversational audio streaming.

### 3.2 GPS & Interactive Incident Mapping
* **Browser Geolocation**:
  * Citizen grants explicit permission via `navigator.geolocation`.
  * Captures latitude, longitude, and accuracy radius in meters.
* **Geospatial Persistence**:
  * Stored on MongoDB `assistance_requests` collection with standard GeoJSON `Point` coordinates (`[longitude, latitude]`) and 2dsphere indexing.
* **Interactive Map UI (`IncidentMap.tsx`)**:
  * Built using Leaflet and OpenStreetMap.
  * Zero API key requirement; zero third-party tracking or per-request mapping fees.
  * Renders dynamic animated pulse beacon, accuracy boundary circle, and incident details popup.
  * Direct deep-link to external navigation (Google Maps navigation URL).
* **Insecure Direct Object Reference (IDOR) Protection**:
  * Unauthenticated users cannot read location coordinates.
  * Volunteers can only access coordinates for incidents currently assigned to them.
  * Police administrators have full authorized district oversight.

### 3.3 Automated Volunteer Dispatch Engine
* **Deterministic Matching Algorithm (`selectEligibleVolunteer`)**:
  1. Filters volunteers by `verification_status: 'verified'` and `is_available: true`.
  2. Ranks candidate volunteers by active workload (lowest assigned count first).
  3. Breaks ties deterministically by volunteer registration timestamp.
  4. If all eligible volunteers are busy, queues the incident and tracks `queue_position`.
* **Request Lifecycle State Machine**:
  * `pending_assignment` ➔ `assigned` ➔ `accepted` ➔ `in_progress` ➔ `completed`.
  * Safe terminal states: `cancelled`, `escalated_to_112`.
  * State transitions validated strictly against `ALLOWED_TRANSITIONS`.

### 3.4 Distributed Security & Anti-Abuse
* **Redis-Backed Keyed OTP**:
  * 6-digit OTP with 5-minute TTL.
  * Stored as keyed HMAC-SHA256 hashes (`crypto.createHmac`); plaintext OTP is never persisted in Redis or database.
  * Atomic Lua script execution: single-use invalidation upon success; strict 5-attempt lockout against brute-force attacks.
* **Distributed Rate Limiting**:
  * Atomic Redis Lua counters returning `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` headers.
  * Protected endpoints: Citizen SOS, Volunteer OTP dispatch, and Admin/Volunteer login.
  * Throttles `/auth/login` without leaking whether target email accounts exist.
  * Fail-closed architecture (HTTP 503) in production if Redis becomes unavailable.

---

## 4. User Workflows

```
Citizen Emergency Workflow:
[ Citizen ] ──> (Clicks SOS / Grants GPS) ──> [ POST /requests/citizen ]
                                                       │
                                      ┌────────────────┴────────────────┐
                                      ▼                                 ▼
                         [ Gemini AI Classification ]     [ MongoDB assistance_requests ]
                                      │                                 │
                                      ▼                                 ▼
                         [ Automatic Dispatch Engine ] ──> [ Incident Map on Dashboard ]
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        (Free Volunteer Found)                (All Volunteers Busy)
                   │                                     │
                   ▼                                     ▼
      [ Request Assigned & Notified ]        [ Placed in Queue (Pos #) ]
```

---

## 5. Scope & Boundaries

### In Scope
* Web citizen emergency SOS with optional GPS and text location fallback.
* Police admin incident management, dispatch override, and volunteer verification portal.
* Community volunteer request acceptance, progress tracking, and resolution workflow.
* Leaflet + OpenStreetMap interactive mapping.
* Google Gemini AI emergency triage and disposition analysis.
* Exotel telephony webhook and Sarvam AI tool integration.
* LiveKit Voice Agent worker.
* Redis-backed distributed rate limiting and atomic OTP security.

### Out of Scope
* Direct SIP trunk provisioning and softswitch PBX routing (Exotel PSTN handles carrier routing).
* Physical hardware IoT distress buttons or wearable firmware.
* In-app commercial payment gateways or compensation processing.

---

## 6. Known Limitations
1. **Public Tile Server Rate Guidelines**: Leaflet uses OpenStreetMap public standard tiles. High-volume enterprise deployments should point `IncidentMap.tsx` to a dedicated tile proxy (e.g., Stadia, Protomaps, or self-hosted tile server).
2. **Serverless Hosting Boundaries**: The React frontend deploys statelessly to Vercel. The Express backend requires a persistent Node.js runtime (e.g. Render, Railway, AWS ECS) because it manages long-lived WebSocket connections for voice audio streaming.
3. **SMS Gateway Credentials**: In local development, OTPs are returned in API responses for developer testing. In production, an active SMS provider (e.g., Exotel, Twilio, or Kaleyra) must be configured for carrier SMS dispatch.
