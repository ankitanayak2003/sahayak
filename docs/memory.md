# Sahayak (सहायक) — Developer Memory & Project Context

## 1. Project Overview & Identity

* **Product**: Sahayak (सहायक — "Helper/Assistant")
* **Purpose**: Multi-channel emergency assistance and volunteer coordination platform connecting senior citizens and individuals in distress with police dispatchers and verified community volunteers.
* **Workspace Root**: `c:\Users\ankita\Desktop\sahayak-final`
* **Current Working Branch**: `feature/phase-3-redis-security`
* **Immutable Baseline Branch**: `backup/phase-1-2-baseline` (Do NOT modify or delete)
* **Remote Repository**: `https://github.com/ankitanayak2003/sahayak.git`
* **Current Project Status**: Current demo scope: COMPLETE. 165 backend tests passing, frontend lint/build clean.

---

## 2. Core Architecture & Tech Choices

1. **Frontend (`fornent end/`)**:
   - React 19 + TypeScript + Vite + Tailwind CSS v4.
   - Single Page Application (SPA) with centralized state in `AppContext.tsx`.
   - Leaflet 1.9.4 + OpenStreetMap standard raster tiles for interactive incident maps (`IncidentMap.tsx`). Eliminates external Google Maps API key leaks and per-request tile charges.
   - Deploys statelessly to Vercel with clean URL rewrites in `fornent end/vercel.json`.
2. **Backend (`src/`)**:
   - Monolithic Express service on Node.js 20+ LTS (CommonJS).
   - Must be hosted on a persistent container or VM (Docker, Render, Railway, AWS ECS) because it manages persistent WebSocket connections (`/ws`) for telephony audio streaming. Do not deploy backend as Vercel serverless functions.
   - Single source of truth for environment variables: `src/config/env.js`.
3. **Database & Cache**:
   - **MongoDB Atlas**: Primary operational database storing users, volunteers, emergency requests, audit histories, and refresh tokens. Uses `2dsphere` index on GeoJSON Point `location_geojson`.
   - **Redis 7**: Distributed cache, keyed HMAC-SHA256 OTP storage, and atomic Lua-based distributed rate limiting.
4. **Voice & Telephony Integrations**:
   - Exotel PSTN gateway via WebSocket `/ws` (8kHz PCM audio).
   - Sarvam AI streaming regional language STT (`saaras:v3`) and TTS (`bulbul:v3`) with tool webhook at `POST /api/v1/sarvam/emergency`.
   - LiveKit Cloud conversational agent background worker (`src/agents/livekit/agent.js`).
   - Note: Carrier SIP trunk routing is out of scope.

---

## 3. Key Security & Workflow Decisions

1. **Keyed HMAC-SHA256 OTP Storage**:
   - Plaintext OTPs are never stored in Redis or MongoDB.
   - Stored as HMAC-SHA256 keyed hashes with 5-minute TTL.
   - Atomic verification via Redis Lua script (`VERIFY_OTP_LUA`): single-use invalidation upon success; strict lockout and key deletion after 5 failed attempts.
2. **Distributed Rate Limiting**:
   - Atomic Redis Lua script fixed-window limiter on public routes (`/requests/citizen`, `/volunteers/send-otp`, `/auth/login`).
   - Uses `TRUST_PROXY` to derive genuine client IP from `req.ip`.
   - **Fail-Closed Principle**: In production (`NODE_ENV === 'production'`) or when `REDIS_REQUIRED=true`, the service returns HTTP 503 if Redis is unreachable. Never silently downgrade security controls in production.
3. **PII Encryption & Blind Indexing**:
   - Phone numbers are encrypted using authenticated AES-256-GCM (`phone_number_encrypted`).
   - Queries use deterministic HMAC-SHA256 blind indexing (`phone_number_blind_index`).
   - `PHONE_ENCRYPTION_KEY` and `PHONE_BLIND_INDEX_SECRET` must be separate secrets.
4. **Location Privacy & IDOR Protection**:
   - Coordinates are sensitive PII. Unauthenticated requests cannot read coordinates.
   - Volunteers can only read coordinates of incidents assigned to them.
5. **Deterministic Volunteer Dispatch**:
   - Volunteers must be `verification_status === 'verified'` and `is_available === true`.
   - Ranked by active uncompleted assignments (least busy first), tie-broken by earliest registration.
   - If all volunteers are occupied, requests are queued with `queue_position`.

---

## 4. Invariants — Things Future Developers Must NOT Change

* **DO NOT modify `backup/phase-1-2-baseline`**: This branch must remain untouched.
* **DO NOT commit `.env` files**: All secrets must stay excluded by `.gitignore`.
* **DO NOT put backend credentials in `VITE_*` variables**: The browser must only receive `VITE_API_BASE_URL`.
* **DO NOT silently downgrade Redis in production**: If Redis is down in production, fail closed with HTTP 503.
* **DO NOT weaken or delete security tests**: All 165 backend tests must remain green.
* **DO NOT deploy backend as serverless functions**: Telephony WebSockets require a persistent container process.
* **DO NOT bypass `ALLOWED_TRANSITIONS`**: State machine validation must remain strict.

---

## 5. Verification Commands

```bash
# Backend test suite (165 passing tests)
npm test

# Frontend TypeScript lint check
cd "fornent end" && npm run lint

# Frontend production build
cd "fornent end" && npm run build
```
