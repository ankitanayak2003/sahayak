# Sahayak — Project Rules, Conventions & Security Guidelines

## 1. Codebase Structure & Conventions

### Language & Module Standards
* **Backend (`src/`, `test/`, `scripts/`)**:
  * Runtime: Node.js 20+ LTS.
  * Module system: CommonJS (`require` / `module.exports`).
  * API prefix: All REST endpoints must be mounted under `/api/v1`.
  * Response format: Always use standard response wrappers from `src/utils/apiResponse.js` (`success(res, statusCode, data)` and `error(res, statusCode, message)`).
  * Error Handling: All Express async route handlers must be wrapped in `asyncHandler(fn)` from `src/utils/asyncHandler.js`.
* **Frontend (`fornent end/`)**:
  * Framework: React 19 + TypeScript + Vite.
  * Module system: ES Modules (`import` / `export`).
  * CSS: Tailwind CSS v4 utility classes.
  * Public Variables: Only variables prefixed with `VITE_` can be read in browser code.

---

## 2. Security & Compliance Rules

### Secret & Key Management
* **Zero Secret Exposure**:
  * Never commit `.env` or `.env.local` files to Git.
  * Never print, log, or serialize credentials, JWT secrets, database connection strings, or third-party API keys.
  * Use `logger.info()` and `logger.warn()` from `src/utils/logger.js`; avoid raw `console.log`.
* **Frontend Isolation**:
  * Never place backend secrets (`JWT_SECRET`, `DATABASE_URL`, `MONGODB_URI`, `SARVAM_TOOL_SHARED_SECRET`, `PHONE_ENCRYPTION_KEY`) in the frontend directory or prefixed with `VITE_`.
  * The frontend only requires `VITE_API_BASE_URL`.

### Data Protection & PII Privacy
* **Phone Encryption**:
  * Plaintext phone numbers must never be stored directly in MongoDB.
  * Storage requires authenticated AES-256-GCM encryption (`phone_number_encrypted`).
  * Queries on phone numbers must use the HMAC-SHA256 blind index (`phone_number_blind_index`) generated via `createPhoneBlindIndex(phone)`.
* **OTP Cryptographic Protection**:
  * Plaintext OTPs must **never** be stored in Redis or database.
  * Store only HMAC-SHA256 hashes generated with `hashOtp(phoneKey, otp)`.
  * Verification must be atomic (Redis Lua script) enforcing single-use deletion and strict lockout after 5 failed attempts.

### Access Control & Anti-Abuse
* **Role-Based Access Control (RBAC)**:
  * Public endpoints: `POST /api/v1/requests/citizen`, `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/volunteers/send-otp`.
  * Authenticated endpoints must mount `authenticate` middleware.
  * Role authorization must mount `requireRole(ROLES.POLICE_ADMIN)` or `requireRole(ROLES.VOLUNTEER)`.
* **Distributed Rate Limiting**:
  * Rate limiting must be applied to all public intake, login, and OTP routes.
  * Always derive client IP using Express `req.ip` via `app.set('trust proxy', ...)`. Never blindly trust raw `X-Forwarded-For` headers.
  * **Fail-Closed Principle**: In production (`NODE_ENV === 'production'`) or when `REDIS_REQUIRED=true`, rate limiters and OTP services must return controlled HTTP 503 if Redis is unreachable. **Never silently downgrade security controls to process-local memory in production.**

---

## 3. Environment Variable Standards

### Single Source of Truth (`src/config/env.js`)
* All environment variable reads (`process.env.*`) are strictly encapsulated in `src/config/env.js`.
* Other files must import `env` from `src/config/env.js` and never read `process.env` directly.
* Startup validation in `validateEnv()` fails fast if mandatory variables are missing.
* `REDIS_URL` is required **only when `REDIS_REQUIRED === 'true'`**. When `REDIS_REQUIRED` is false/omitted, the system defaults to a safe disconnected stub without throwing startup errors.

---

## 4. Testing & Verification Standards

### Test Runner & Coverage
* Backend tests use Node.js's native test runner (`node --test`). No Jest, Mocha, or external runner dependencies.
* Run backend tests via:
  ```bash
  npm test
  ```
* All tests must execute cleanly and terminate without leaving background network handles or open sockets.
* In test environments, Redis sockets must be unref'd (`redisClient.stream.unref()`) so the runner process exits promptly.
* Frontend TypeScript check and production build must be validated via:
  ```bash
  cd "fornent end"
  npm run lint
  npm run build
  ```

---

## 5. Deployment Constraints

* **Frontend**:
  * Platform: Vercel.
  * Root directory: `fornent end`.
  * Build command: `npm run build`.
  * Output directory: `dist`.
  * Clean URLs and SPA fallback configured in `fornent end/vercel.json`.
* **Backend**:
  * Platform: Persistent container or VM (Render, Railway, AWS ECS/Fargate, Docker).
  * **Do not deploy the Express backend as a Vercel serverless function**: Vercel serverless functions cannot maintain long-running WebSocket connections for telephony voice streams or LiveKit agent workers.
