# Sahayak (सहायक) — Engineering Rules, Security Policies & Development Standards

This document establishes the mandatory architectural rules, engineering standards, security invariants, and coding conventions that all contributors and automated workflows must strictly observe.

---

## 1. Codebase Structure & Conventions

### 1.1 Backend Standards (`src/`, `test/`, `scripts/`)
* **Runtime**: Node.js 20+ LTS.
* **Module System**: CommonJS (`require` and `module.exports`). Do not mix ES `import`/`export` syntax in backend files.
* **API Route Mounting**: Every public or authenticated REST endpoint must be mounted under the `/api/v1` prefix.
* **Controller Wrappers**: All asynchronous Express route handlers must be wrapped with `asyncHandler(fn)` from `src/utils/asyncHandler.js` to prevent unhandled promise rejections.
* **Standard Response Envelopes**:
  - Success responses must use `success(res, statusCode, data, message)` from `src/utils/apiResponse.js`.
  - Error responses must use `error(res, statusCode, message, errors)` from `src/utils/apiResponse.js`.
  - Raw `res.json(...)` or `res.send(...)` calls in controllers are prohibited.
* **Logging Standards**:
  - Always use `logger.info()`, `logger.warn()`, and `logger.error()` from `src/utils/logger.js`.
  - Never use naked `console.log` in production service code.
  - Sensitive parameters (passwords, tokens, phone numbers, API keys) must be redacted before logging.

### 1.2 Frontend Standards (`fornent end/`)
* **Framework**: React 19 + TypeScript + Vite.
* **Module System**: ES Modules (`import`/`export`).
* **Styling**: Tailwind CSS v4 utility classes.
* **Environment Variables**: Only variables prefixed with `VITE_` can be read in the browser.
* **Client Routing**: Single Page Application (SPA) routing with centralized state in `AppContext.tsx`.

---

## 2. Security & Secret Management Rules

### 2.1 Absolute Zero-Secret-Exposure Policy
* **Never commit secrets to Git**:
  - `.env`, `.env.local`, `.env.production` files must **never** be committed.
  - The repository's `.gitignore` and `fornent end/.gitignore` must maintain strict exclusion patterns for `.env*` (except `.env.example`).
* **Frontend Credential Isolation**:
  - **Never put production credentials or backend secrets in frontend `VITE_*` variables.**
  - `VITE_API_BASE_URL` is the only environment variable permitted on the client.
  - Database connection strings, JWT secrets, Gemini API keys, Sarvam API keys, and telephony passwords must never enter `fornent end/`.
* **Timing-Attack Prevention**:
  - All token, signature, and credential comparisons (e.g., Bearer shared secret verification, Basic Auth verification) must use constant-time comparison (`crypto.timingSafeEqual`) as implemented in `src/utils/providerAuthentication.js`.

### 2.2 Personally Identifiable Information (PII) Protection
* **Phone Numbers**:
  - Plaintext phone numbers must never be persisted directly in MongoDB user documents.
  - Always store phone numbers using AES-256-GCM authenticated encryption (`phone_number_encrypted`) generated via `encryptPhoneNumber(phone)` in `src/utils/phoneSecurity.js`.
  - Querying and deduplicating phone numbers must use HMAC-SHA256 blind indexing (`phone_number_blind_index`) generated via `createPhoneBlindIndex(phone)`.
  - The encryption key (`PHONE_ENCRYPTION_KEY`) and blind index secret (`PHONE_BLIND_INDEX_SECRET`) must be distinct cryptographic values.
* **Location Privacy & IDOR Protection**:
  - Victim GPS coordinates (`latitude`, `longitude`, `accuracy_meters`) are sensitive emergency data.
  - Unauthenticated endpoints cannot access coordinate data.
  - Volunteers can only retrieve coordinates for incidents actively assigned to their volunteer ID. Any attempt to query incidents belonging to other volunteers must be rejected with HTTP 403 Forbidden.

---

## 3. Redis & Distributed Security Rules

### 3.1 One-Time Password (OTP) Standards
* **Never store plaintext OTPs**:
  - Plaintext OTPs must never be stored in Redis, MongoDB, or log files.
  - OTPs must be hashed using HMAC-SHA256 with a secure secret before caching (`src/utils/otpService.js`).
* **Atomic Verification**:
  - OTP verification must execute atomically via Redis Lua script (`VERIFY_OTP_LUA`).
  - Single-use policy: The Redis OTP key must be purged immediately upon successful verification.
  - Brute-force lockout: The atomic script must increment failed attempts and delete the key after 5 failed attempts (`MAX_OTP_ATTEMPTS = 5`), permanently locking out the code.
  - Time-To-Live (TTL): OTPs must have an automatic expiration TTL of 5 minutes (300 seconds).

### 3.2 Distributed Rate Limiting Standards
* **Atomic Redis Counters**:
  - Rate limiting must use atomic Lua scripts to evaluate request counts in a single network roundtrip.
  - Rate limiting is mandatory on public SOS intake (`POST /requests/citizen`), login (`POST /auth/login`), and OTP dispatch (`POST /volunteers/send-otp`).
* **IP Resolution**:
  - Derives client IP strictly through Express `req.ip` configured with `TRUST_PROXY`. Do not blindly trust spoofed header values.
* **Fail-Closed Principle**:
  - **Never silently downgrade production security mechanisms when Redis is required.**
  - In production (`NODE_ENV === 'production'`) or when `REDIS_REQUIRED=true`, if the Redis cluster is unreachable, rate limiters and OTP services must return HTTP 503 Service Unavailable rather than silently allowing unmetered access or in-memory bypasses.

---

## 4. Input Validation & Data Integrity Rules

### 4.1 Boundary Enforcement
* **Public Citizen SOS**:
  - `description`: String, required, maximum length 500 characters.
  - `location_text`: String, optional, maximum length 200 characters.
  - `category`: Validated enum (`medical`, `fall`, `groceries`, `companionship`, `transport`, `other`).
  - `phone`: Optional, sanitized and normalized to 10–15 digits.
* **Request Payload Size**:
  - Express request body limit is bounded to `10mb` via `src/config/env.js` to guard against memory exhaustion attacks.

### 4.2 GPS & Geolocation Validation Rules
* **Central Validation**: All incoming coordinates must pass `validateLocationPayload(body)` from `src/utils/locationValidation.js`.
* **Atomic Coordinate Pairs**: Latitude and longitude must be provided together. Supplying one without the other must be rejected with HTTP 400.
* **WGS84 Bounds**:
  - Latitude must be a finite number between `-90` and `+90`.
  - Longitude must be a finite number between `-180` and `+180`.
* **Accuracy Radius**:
  - Must be a finite non-negative number (`accuracy_meters >= 0`).
* **No Coordinate Fabrication**:
  - Missing GPS coordinates must remain `null` or omitted; never invent or mock coordinates from text addresses.
  - Backward compatibility: If no coordinates are supplied, the request must still succeed with `hasCoordinates: false` and rely on text address descriptions.

---

## 5. Emergency Workflow & State Transition Rules

### 5.1 Permitted State Transitions
The incident lifecycle is strictly governed by `ALLOWED_TRANSITIONS` in `src/services/requestService.js`:

```text
pending_assignment ──► assigned
pending_assignment ──► cancelled
pending_assignment ──► escalated_to_112

assigned           ──► accepted
assigned           ──► pending_assignment (rejection/auto-requeue)
assigned           ──► cancelled
assigned           ──► escalated_to_112

accepted           ──► in_progress
accepted           ──► cancelled
accepted           ──► escalated_to_112

in_progress        ──► completed
in_progress        ──► escalated_to_112
```

* Any state transition not explicitly listed above must be rejected with HTTP 400 Bad Request.
* Directly moving an `assigned` incident to `completed` is forbidden.
* Every status change must create an immutable audit record in `request_status_history`.

---

## 6. Database Rules (MongoDB Atlas)

* **Primary Operational Store**: MongoDB Atlas is the sole source of truth for persistent application state.
* **Geospatial Queries**:
  - Coordinates must be persisted in GeoJSON format `{ type: 'Point', coordinates: [longitude, latitude] }`.
  - Note: GeoJSON specifies `[longitude, latitude]`, whereas standard GPS notation specifies `[latitude, longitude]`.
  - The `2dsphere` index on `location_geojson` must be maintained.
* **Referential Integrity in Cleanup Scripts**:
  - Deletion or reset scripts must delete child/dependent records (`request_status_history`, `emergency_escalations`, `request_assignments`, `call_logs`, `notifications`) **before** parent records (`assistance_requests`).
  - Admin accounts, volunteer verification profiles, and active user credentials must never be dropped by demo reset scripts.

---

## 7. Environment Variables Standards

* **Single Source of Truth**:
  - `src/config/env.js` is the sole module permitted to read `process.env`.
  - All other backend modules must import `env` from `src/config/env.js`.
* **Fail-Fast Startup**:
  - `validateEnv()` runs at startup and halts the process immediately with an actionable error if mandatory variables (`MONGODB_URI`, `JWT_SECRET`, etc.) are missing.
* **Sanitized Example Files**:
  - `.env.example` and `fornent end/.env.example` must contain placeholder values only. Never paste real credentials into `.env.example`.

---

## 8. Testing & Verification Rules

* **Native Test Runner**: Backend tests use Node.js's native test runner (`node --test`). No external frameworks (Jest, Mocha) are permitted.
* **Security Test Invariant**:
  - **Do not weaken or remove security tests just to make tests pass.**
  - If a test fails, fix the underlying code or environment configuration, not the test assertion.
* **Clean Test Lifecycle**:
  - Test suites must clean up active sockets, mock servers, and background timers.
  - In tests, Redis sockets must be unref'd (`redisClient.stream.unref()`) to allow the Node.js event loop to terminate cleanly.
* **Full Verification Gates**:
  - Prior to merging or deploying, all 165 backend tests must pass: `npm test`.
  - Frontend typecheck must pass: `cd "fornent end" && npm run lint`.
  - Frontend production build must succeed: `cd "fornent end" && npm run build`.

---

## 9. Git & Deployment Rules

* **Backup Branch Protection**:
  - **The backup branch `backup/phase-1-2-baseline` must remain untouched.**
  - Never push to, rebase, or modify `backup/phase-1-2-baseline`.
* **Repository Cleanliness**:
  - Do not force-push (`git push --force`) to shared branches.
  - Do not rewrite or squash Git history.
  - Run `git status` and `git diff --check` to verify no trailing whitespace or untracked sensitive files exist.
* **Runtime Platform Rules**:
  - **Frontend**: Deploys to Vercel (Root: `fornent end`, SPA rewrites in `vercel.json`).
  - **Backend**: Must be deployed on a persistent container or VM platform (Docker, Render, Railway, AWS ECS) because it hosts persistent WebSocket connections for telephony audio streaming. Do not deploy the backend as a Vercel serverless function.
