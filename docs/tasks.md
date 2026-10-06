# Sahayak (सहायक) — Implementation Tasks & Status

```text
Current demo scope: COMPLETE
```

All core architectural features, emergency workflows, mapping interfaces, telephony gateways, AI triage models, and distributed security controls required for the Sahayak emergency assistance platform are fully implemented and verified.

---

## 1. Completed Work (Implemented & Verified)

### 1.1 Phase 0 — Baseline Audit & Architecture Verification [VERIFIED]
- Complete architectural audit across backend, frontend, MongoDB collections, and test suites.
- 147 baseline backend tests passing with zero failures.
- Verification that no `.env` secret files or credentials were committed to Git history.
- Established untouchable reference branch: `backup/phase-1-2-baseline`.

### 1.2 Phase 1 — Deployment Preparation & Infrastructure Hardening [VERIFIED]
- Configured frontend SPA deployment on Vercel (`fornent end/vercel.json`, `dist/` output, `VITE_API_BASE_URL` resolution).
- Implemented standardized health probe endpoints in `src/routes/health.js`:
  - `GET /health/live`: Fast process event loop liveness probe.
  - `GET /health/ready`: Deep dependency readiness probe verifying live MongoDB ping and Redis socket connectivity.
  - `GET /health`: Backward-compatible legacy health monitoring.
- Implemented CORS origin validator supporting wildcard preview deployments (`*.vercel.app`, `https://sahayak-*.vercel.app`, `http://localhost:*`).
- Implemented graceful shutdown in `src/server.js` draining HTTP connections, closing WebSockets, and releasing MongoDB/Redis pools on SIGTERM/SIGINT.
- Created production container configuration (`Dockerfile`, `Dockerfile.livekit`, `docker-compose.yml`).
- Created comprehensive deployment guide (`deploy/DEPLOYMENT.md`).

### 1.3 Phase 2 — GPS & Interactive Incident Maps [VERIFIED]
- Implemented centralized GPS coordinate validation in `src/utils/locationValidation.js`:
  - Enforced atomic coordinate pairs (latitude and longitude must both be provided or neither).
  - Validated WGS84 decimal ranges (`-90 <= lat <= 90`, `-180 <= lng <= 180`).
  - Enforced non-negative accuracy radius (`accuracy_meters >= 0`).
  - Maintained backward compatibility for text-only emergency requests (`hasCoordinates: false`).
- Persisted location coordinates in MongoDB `assistance_requests` with standard GeoJSON `Point` coordinates (`[longitude, latitude]`) and `2dsphere` spatial indexing.
- Built reusable interactive map component `fornent end/src/components/IncidentMap.tsx`:
  - Powered by Leaflet 1.9.4 and OpenStreetMap raster tiles with zero external API key requirements.
  - Rendered dynamic animated pulse beacon, circular accuracy radius overlay, and popup metadata.
  - Integrated one-click deep link to Google Maps driving navigation (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`).
- Implemented Insecure Direct Object Reference (IDOR) protection:
  - Coordinate data access restricted to authorized police administrators and the specific volunteer assigned to that incident.
- Created 17 dedicated automated tests in `test/gpsAndLocation.test.js`.

### 1.4 Phase 3 — Distributed Redis Security & Rate Limiting [VERIFIED]
- Replaced in-memory OTP storage with Redis-backed HMAC-SHA256 keyed hash storage (`src/utils/otpService.js`):
  - Stored keyed hashes with 5-minute TTL; plaintext OTP is never written to cache or database.
  - Implemented atomic verification via Redis Lua script (`VERIFY_OTP_LUA`):
    - Single-use deletion upon successful verification.
    - Strict 5-attempt lockout: key deleted and permanently locked out on 5th failed attempt.
- Created reusable distributed rate-limiting middleware (`src/middleware/rateLimiter.js`):
  - Atomic Redis Lua script fixed-window limiter.
  - IP resolution using Express `req.ip` configured via `TRUST_PROXY`.
  - Standard headers returned: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`.
  - Protected public endpoints: Citizen SOS (`POST /requests/citizen`), Volunteer OTP (`POST /volunteers/send-otp`), and Login (`POST /auth/login`).
- Hardened public citizen SOS endpoint with explicit boundary checks:
  - `description` bounded to ≤ 500 characters.
  - `location_text` bounded to ≤ 200 characters.
  - Phone normalized to 10–15 digits.
- Enforced fail-closed security posture (HTTP 503) in production (`NODE_ENV === 'production'` or `REDIS_REQUIRED=true`) if Redis is unavailable.
- Created 18 dedicated automated tests in `test/phase3RedisSecurity.test.js`.
- Total test suite expanded to **165 passing tests** (165 passed, 0 failed).

---

## 2. Remaining Work (Operational & Deployment Tasks)

The core application demo scope is complete. The remaining tasks represent standard operational release, publication, and production deployment procedures:

### 2.1 GitHub Publication
- [ ] Complete documentation organization and repository cleanup.
- [ ] Verify clean Git working tree on `feature/phase-3-redis-security`.
- [ ] Review Git diff and verify `backup/phase-1-2-baseline` is untouched.
- [ ] Commit cleanup changes to `feature/phase-3-redis-security`.
- [ ] Push branch to remote repository (`origin`).
- [ ] Merge `feature/phase-3-redis-security` into `main`.

### 2.2 Vercel Frontend Deployment
- [ ] Import GitHub repository into Vercel dashboard.
- [ ] Configure Project Settings:
  - Framework Preset: Vite
  - Root Directory: `fornent end`
  - Build Command: `npm run build`
  - Output Directory: `dist`
- [ ] Set Production Environment Variable:
  - `VITE_API_BASE_URL`: `https://<deployed-backend-domain>/api/v1`
- [ ] Deploy and verify client SPA routes and Leaflet map rendering.

### 2.3 Backend Production Environment Configuration & Hosting
- [ ] Deploy backend container to a persistent hosting platform (Render, Railway, or AWS ECS/Fargate) using root `Dockerfile`.
- [ ] Provision persistent cloud backing services:
  - MongoDB Atlas cluster (configure IP access list / VPC peering and set `MONGODB_URI`).
  - Managed Redis 7 instance (Upstash or Redis Cloud and set `REDIS_URL`).
- [ ] Set production environment variables in hosting dashboard:
  - `NODE_ENV=production`
  - `REDIS_REQUIRED=true`
  - `JWT_SECRET` (minimum 32-character secure random string)
  - `PHONE_ENCRYPTION_KEY` (64-hex character key)
  - `PHONE_BLIND_INDEX_SECRET` (secure random string)
  - `GEMINI_API_KEY`
  - `SARVAM_API_KEY` & `SARVAM_TOOL_SHARED_SECRET`
  - `EXOTEL_WS_USERNAME` & `EXOTEL_WS_PASSWORD`
  - `CORS_ALLOWED_ORIGINS` (Vercel production domain)
- [ ] Verify deployment health via `/health/live` and `/health/ready`.

### 2.4 Production Telephony & SMS Gateway Binding
- [ ] In Exotel dashboard, point inbound call App Bazaar flow WebSocket URL to `wss://<deployed-backend-domain>/ws`.
- [ ] Configure Exotel DTMF webhook to `https://<deployed-backend-domain>/api/v1/voice/webhook`.
- [ ] Connect production carrier SMS provider (Exotel/Twilio) for live volunteer OTP delivery in production mode.
