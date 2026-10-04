# Sahayak — Durable Context & Project Memory

## 1. Project Identity & Branches

* **Project Name**: Sahayak (Emergency Assistance & Volunteer Coordination Platform)
* **Workspace Path**: `C:\Users\ankita\Desktop\sahayak-final`
* **Active Working Branch**: `feature/phase-3-redis-security`
* **Baseline Backup Branch**: `backup/phase-1-2-baseline` (Commit: `6ec6a1b2ec7e6e028ce8c3459db6f80dd67803ac`)
* **Remote Repository**: `https://github.com/ankitanayak2003/sahayak.git`

---

## 2. Key Decisions & Rationale

1. **MongoDB Atlas for Operational Data**:
   * Selected for flexible emergency incident schemas, rapid ingestion of varied telemetry sources (browser GPS, text, telephony), and native GeoJSON `2dsphere` geospatial spatial indexing.
2. **Redis for Security Primitives**:
   * Plaintext OTPs are replaced with keyed HMAC-SHA256 hashes stored in Redis.
   * Atomic Lua script execution eliminates race-condition brute-force attacks against the 5-attempt limit.
   * Distributed rate limiting uses atomic Redis Lua counters. In production, security fails closed (HTTP 503) rather than degrading silently.
3. **Dual-Mode Adapter for Test Portability**:
   * While production strictly mandates Redis, an in-memory fallback adapter is available for offline development and local test suites so `npm test` runs with zero external daemon requirements.
4. **Leaflet + OpenStreetMap (OSM) for Incident Maps**:
   * Adopted to eliminate third-party API key exposure in client bundles and avoid per-request mapping fees.
   * Component `<IncidentMap />` provides dynamic animated pulse beacons, accuracy circles, and one-click Google Maps driving navigation routing.
5. **Decoupled Deployment Architecture**:
   * Frontend: Stateless React 19 SPA deployed to Vercel (Root: `fornent end`).
   * Backend: Monolithic Express application deployed to persistent container (Docker / Render / Railway / AWS ECS) to support long-lived telephony WebSockets and voice worker streams.

---

## 3. Key Directory & File Paths

| File / Directory | Purpose |
| :--- | :--- |
| `fornent end/` | React 19 + TypeScript + Vite frontend application |
| `fornent end/src/components/IncidentMap.tsx` | Reusable Leaflet map component with live beacon & accuracy radius |
| `fornent end/src/services/api.ts` | Frontend API client with JWT auto-refresh and auth token management |
| `fornent end/vercel.json` | Vercel SPA routing and clean URL configuration |
| `src/server.js` | Express HTTP server entrypoint, WebSocket gateway, graceful shutdown |
| `src/config/env.js` | Single source of truth for environment variable loading and validation |
| `src/config/redis.js` | Shared ioredis client with exponential retry and test stream unref |
| `src/middleware/rateLimiter.js` | Distributed Redis rate-limiting middleware with atomic Lua script |
| `src/utils/otpService.js` | Redis-backed OTP generation and atomic Lua verification service |
| `src/utils/phoneSecurity.js` | AES-256-GCM phone encryption, HMAC blind index, phone validation |
| `src/utils/locationValidation.js`| Central WGS84 coordinate and accuracy radius validation logic |
| `src/services/volunteerAssignmentService.js` | Deterministic volunteer dispatch and queue balancing engine |
| `test/` | 17 test suites executed via native Node.js test runner (`node --test`) |
| `docs/` | Project documentation: PRD, Architecture, Rules, Tasks, Memory |

---

## 4. Operational & Verification Commands

```bash
# 1. Run complete backend test suite (165 tests)
npm test

# 2. Run frontend TypeScript / lint checks
cd "fornent end"
npm run lint

# 3. Build frontend production bundle
npm run build

# 4. Start backend in development mode
npm run dev

# 5. Start frontend development server
npm run dev # within "fornent end"
```

---

## 5. Constraints & Invariants for Future Work

* **Never edit or delete `backup/phase-1-2-baseline`**.
* **Never commit `.env` or `.env.local` files**; ensure all secrets remain excluded.
* **Never expose backend credentials in `VITE_` variables**.
* **Do not convert the backend to Vercel serverless functions**; persistent Node.js processes are required for telephony WebSockets and LiveKit voice streaming.
* **Preserve the 165 backend tests**; any new features must include corresponding unit and integration tests.
