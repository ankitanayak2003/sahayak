# Sahayak — Task Tracking & Implementation Roadmap

## 1. Verified Completed Work

### Phase 0 — Baseline Audit & Security Verification [VERIFIED]
- Complete architectural audit across backend, frontend, database collections, and tests.
- Baseline recorded with 147 passing backend tests.
- Verified absence of committed `.env` secrets or build artifacts in Git history.

### Phase 1 — Deployment Preparation & Infrastructure Hardening [VERIFIED]
- Configured frontend for Vercel deployment (`fornent end/vercel.json`, `dist/` output, `VITE_API_BASE_URL` resolution).
- Added standardized health probe endpoints:
  - `GET /health/live`: Fast process liveness check.
  - `GET /health/ready`: Deep dependency readiness verifying MongoDB and Redis.
  - `GET /health`: Backward-compatible legacy health endpoint.
- Implemented CORS origin validator with wildcard subdomain support (`*.vercel.app`, `https://sahayak-*.vercel.app`, `http://localhost:*`).
- Added graceful shutdown handler in `src/server.js` draining HTTP connections, closing WebSockets, and releasing MongoDB/Redis pools on SIGTERM/SIGINT.

### Phase 2 — GPS & Interactive Incident Maps [VERIFIED]
- Implemented GPS coordinate validation in `src/utils/locationValidation.js` (WGS84 range bounds, atomic pair enforcement, accuracy radius validation).
- Integrated Leaflet + OpenStreetMap mapping in `fornent end/src/components/IncidentMap.tsx` with dynamic animated radar beacon, circular accuracy overlay, and Google Maps navigation deep-linking.
- Persisted coordinates to MongoDB `assistance_requests` with GeoJSON `Point` format for 2dsphere indexing.
- Added IDOR coordinate isolation preventing unauthorized callers from accessing sensitive victim location data.
- Created Phase 2 documentation (`docs/phase_2_gps_and_maps.md`).

### Phase 3 — Distributed Redis Security & Rate Limiting [VERIFIED]
- Replaced plaintext in-memory OTP storage with Redis-backed HMAC-SHA256 keyed hash storage.
- Implemented atomic Redis Lua verification (`VERIFY_OTP_LUA`) with single-use deletion and strict 5-attempt brute-force lockout.
- Created reusable distributed rate-limiting middleware (`src/middleware/rateLimiter.js`) with atomic Lua counters, trusted proxy IP derivation, standard rate-limit headers, and HTTP 429 Retry-After responses.
- Protected `POST /requests/citizen`, `POST /auth/login`, and OTP dispatch routes.
- Applied explicit length boundaries (description ≤ 500 chars, location ≤ 200 chars) and phone normalization on public citizen SOS endpoint.
- Resolved environment inconsistency between `REDIS_REQUIRED` and `REDIS_URL`.
- Enforced fail-closed behavior (HTTP 503) in production if required Redis services are unavailable.
- Created `test/phase3RedisSecurity.test.js` with 18 automated tests.
- Full backend test suite passed: **165/165 tests passing** (147 existing baseline + 18 Phase 3 tests).
- Frontend lint (`tsc --noEmit`) and production build (`vite build`) passed with zero errors.

---

## 2. Outstanding Work & Next Phases

### Phase 4 — GitHub Publication & Vercel Frontend Deployment [IN PROGRESS]
- Clean up documentation and create unified project specification files (`docs/prd.md`, `docs/architecture.md`, `docs/rules.md`, `docs/tasks.md`, `docs/memory.md`).
- Update root `README.md` for public GitHub presentation.
- Commit all Phase 3 and documentation changes on branch `feature/phase-3-redis-security`.
- Push to verified GitHub remote (`https://github.com/ankitanayak2003/sahayak.git`).
- Deploy frontend Single-Page Application to Vercel with root directory `fornent end` and configured `VITE_API_BASE_URL`.

### Future Milestones (Post-Phase 4)
- **Containerized Backend Deployment**:
  Deploy backend Docker container (`Dockerfile`) to Render, Railway, or AWS ECS with production MongoDB Atlas and managed Redis instance.
- **SMS Gateway Production Binding**:
  Connect Exotel / Twilio SMS API credentials for live carrier delivery of volunteer OTPs in production.
- **Dedicated Map Tile Cache**:
  Configure commercial or self-hosted tile cache proxy (e.g. Stadia Maps / MapLibre) for high-scale enterprise mapping without reliance on public OpenStreetMap volunteer tile servers.
- **WebSocket Cluster Scaling**:
  Implement Redis Pub/Sub adapter for scaling real-time emergency notifications across multiple backend node instances.

---

## 3. Known Limitations & Technical Debt

| Item | Impact | Mitigation / Recommendation |
| :--- | :--- | :--- |
| **Monolithic Node Runtime** | Backend manages WebSockets and cannot run on pure serverless edge | Deploy backend to persistent container (Docker / Render / Railway / AWS ECS) |
| **Public OSM Tile Limits** | High zoom tile queries to OSM standard servers are subject to fair-use limits | Swap tile URL in `IncidentMap.tsx` to self-hosted or commercial vector tile proxy before high-scale public rollout |
| **Development OTP Echo** | In non-production environments, generated OTP is echoed in API response | By design in development mode; production suppresses OTP in API response and dispatches via SMS |

---

## 4. Prioritized Next Steps
1. Finalize documentation files in `docs/` and root `README.md`.
2. Commit changes cleanly on `feature/phase-3-redis-security`.
3. Push branch to GitHub origin.
4. Deploy the frontend to Vercel.
