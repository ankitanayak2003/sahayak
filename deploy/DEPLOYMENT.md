# Sahayak Production Deployment & Operations Guide

This guide provides step-by-step instructions for deploying the **Sahayak Emergency Assistance and Coordination System** to production infrastructure.

The architecture decouples the stateless web frontend deployed to **Vercel** from the long-running persistent backend, telephony WebSockets, and voice workers deployed to a container or Node.js hosting platform (such as **Render**, **Railway**, **AWS App Runner / ECS**, or a managed **Linux VM**).

---

## Architecture Overview

```
                      +-----------------------------+
                      |   Vercel Edge Network       |
                      |   (React 19 + Vite Frontend)|
                      |   Root: 'fornent end'       |
                      +--------------+--------------+
                                     |
                                     | HTTPS (REST API)
                                     v
+------------------+  HTTPS / WSS   +-----------------------------+
| Exotel Telephony | -------------> | Sahayak Monolithic Backend  |
| (PSTN Inbound)   | <------------- | (Node.js 20 Express)        |
+------------------+                +--------------+--------------+
                                                   |
                     +-----------------------------+-----------------------------+
                     |                             |                             |
                     v                             v                             v
       +----------------------------+  +----------------------+    +---------------------------+
       | MongoDB Atlas              |  | Redis                |    | LiveKit Cloud Worker      |
       | (Primary Database)         |  | (Distributed State)  |    | (Google Gemini Voice)     |
       +----------------------------+  +----------------------+    +---------------------------+
```

---

## 1. Preparing the Codebase for GitHub

Before pushing your repository to GitHub, verify that all sensitive configuration files, keys, and test artifacts are properly ignored.

### 1.1 Verify `.gitignore`
Ensure the repository's root `.gitignore` excludes all `.env` files:
```gitignore
node_modules/
.env*
!.env.example
logs/
dist/
coverage/
.DS_Store
*.log
```

And in `fornent end/.gitignore`:
```gitignore
node_modules/
dist/
.env*
!.env.example
```

### 1.2 Git Security Check Command
Run the following in PowerShell or bash to verify no secrets are tracked:
```bash
# Check if any .env files are tracked by Git (should return empty)
git ls-files | grep -i "\.env"
# Only .env.example should be returned
```

### 1.3 Commit and Push
```bash
git add .
git commit -m "feat(deploy): prepare frontend for Vercel and backend for container hosting"
git branch -M main
git remote add origin https://github.com/<your-organization>/<your-repo>.git
git push -u origin main
```

---

## 2. Frontend Deployment on Vercel

The frontend is located in the `fornent end/` directory.

### 2.1 Import Project into Vercel
1. Log in to [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** -> **Project**.
3. Select your GitHub repository.

### 2.2 Configure Project Settings
In the Vercel project configuration screen:
- **Project Name**: `sahayak-web` (or your preferred name)
- **Framework Preset**: `Vite`
- **Root Directory**: Click **Edit** and choose `fornent end`. *(Crucial: Do not leave as `./`)*
- **Build & Development Settings**:
  - **Build Command**: `npm run build` (detected automatically)
  - **Output Directory**: `dist` (detected automatically)
  - **Install Command**: `npm install` (detected automatically)

### 2.3 Set Frontend Environment Variables
In **Settings** -> **Environment Variables**:

| Variable | Recommended Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://<your-backend-domain>/api/v1` | Point to your deployed backend (e.g. `https://sahayak-api.onrender.com/api/v1`). If backend is not yet deployed, temporarily use placeholder `https://api.sahayak.placeholder/api/v1` and update after Step 3. |

*Security Note: Never configure database connection strings, JWT secrets, Gemini API keys, or telephony passwords in Vercel environment variables. Vite exposes variables prefixed with `VITE_` directly to the client browser.*

### 2.4 Deploy
Click **Deploy**. Vercel will build the frontend bundle. The included `fornent end/vercel.json` automatically configures SPA route rewrites so refreshing URLs like `/admin-dashboard` or `/volunteer-dashboard` does not return a 404.

---

## 3. Backend Deployment (Render / Railway / AWS / Docker)

The backend runs Express with long-lived WebSocket connections (`/ws` for Exotel) and connects to MongoDB Atlas and Redis. It must be hosted on a platform that supports persistent processes.

### 3.1 Option A: Deploy on Render.com (Web Service)
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your repository.
4. Select settings:
   - **Root Directory**: `.` (root)
   - **Environment**: `Node` (or `Docker` using root `Dockerfile`)
   - **Build Command**: `npm ci --omit=dev`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health/ready`

### 3.2 Option B: Deploy with Docker / AWS App Runner / ECS
Use the included root `Dockerfile`:
```bash
# Build production image locally
docker build -t sahayak-backend:latest -f Dockerfile .

# Test run locally with environment file
docker run -p 5000:5000 --env-file .env sahayak-backend:latest
```

### 3.3 Backend Environment Variables (Configure in Cloud Host)

Configure these secrets securely in your hosting provider's dashboard:

| Variable | Description | Example / Format |
|---|---|---|
| `NODE_ENV` | Application environment | `production` |
| `PORT` | Listening port for Express | `5000` (or host-provided `$PORT`) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed frontend domains. Supports exact domains (`https://sahayak.vercel.app`), project-scoped wildcards (`https://sahayak-*.vercel.app`), and local ports (`http://localhost:*`) | `https://sahayak.vercel.app,https://sahayak-*.vercel.app` |
| `TRUST_PROXY` | Trust reverse proxy hops (ALB, Render, Cloudflare) | `1` |
| `BODY_LIMIT` | Maximum request body size | `10mb` |
| `REDIS_REQUIRED` | Fail readiness if Redis is disconnected (default `false` in Phase 1) | `false` |
| `MONGODB_URI` | MongoDB Atlas connection string (Primary Persistent Database) | `mongodb+srv://<user>:<pwd>@cluster.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | Primary database name | `sahayak` |
| `DATABASE_URL` | PostgreSQL connection string (Legacy / pool configuration preserved for compatibility with `src/config/db.js`; not used for persistent storage) | `postgresql://user:password@host:5432/sahayak_db` |
| `REDIS_URL` | Redis instance connection string | `redis://default:<pwd>@<host>:<port>` |
| `JWT_SECRET` | Secret for signing JWT access tokens (min 32 chars) | `<secure-random-string>` |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | Access token lifespan | `15m` |
| `PHONE_ENCRYPTION_KEY` | 32-byte (64 hex characters) AES-256 key | `<64-hex-characters>` |
| `PHONE_BLIND_INDEX_SECRET` | Secret key for HMAC-SHA256 blind indexing | `<secure-random-string>` |
| `GEMINI_API_KEY` | Google Gemini API key for emergency classification | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini model name | `gemini-2.5-flash-lite` |
| `SARVAM_API_KEY` | Sarvam AI API key for streaming STT/TTS | `<sarvam-api-key>` |
| `SARVAM_TOOL_SHARED_SECRET` | Primary required Bearer token for voice agent webhook intake and telephony | `<secure-random-string>` |
| `SAHAYAK_TOOL_SHARED_SECRET` | Optional alias for internal tools and LiveKit (falls back to `SARVAM_TOOL_SHARED_SECRET` if unset) | `<secure-random-string>` |
| `SAHAYAK_BACKEND_URL` | Self URL for LiveKit worker to call dispatch | `https://<your-backend-domain>` |
| `EXOTEL_WS_USERNAME` | Basic Auth username expected from Exotel | `<exotel-username>` |
| `EXOTEL_WS_PASSWORD` | Basic Auth password expected from Exotel | `<exotel-password>` |
| `EXOTEL_WS_PATH` | Path for telephony audio WebSocket stream | `/ws` |
| `EXOTEL_ALLOW_UNAUTHENTICATED_WS` | Allow unauthenticated WS in local testing | `false` |
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit project API key | `<livekit-api-key>` |
| `LIVEKIT_API_SECRET` | LiveKit project API secret | `<livekit-api-secret>` |

---

## 4. Backing Services Setup

### 4.1 MongoDB Atlas Network Access (Narrowest Feasible Policy)

Apply the **principle of least privilege** and the narrowest feasible network access policy:

1. **Option 1 (Most Secure — Recommended for AWS/GCP/Azure)**:
   - Configure **VPC Peering** or **AWS PrivateLink / Azure Private Link / GCP Private Service Connect** between your cloud hosting VPC and MongoDB Atlas.
   - Traffic stays within private cloud backbones and is never exposed to the public internet.
2. **Option 2 (Static Outbound IP Whitelisting)**:
   - If hosting on a platform with static outbound egress IPs (e.g. Render with dedicated egress IP, AWS NAT Gateway, DigitalOcean App Platform dedicated IPs), add ONLY those specific static IPs (`/32`) to the Atlas IP Access List.
3. **Option 3 (Dynamic Ephemeral Hosting Fallback)**:
   - If your cloud host uses dynamic ephemeral egress IPs without VPC peering or static IPs:
     - Prefer using the MongoDB Atlas Administration API in your CI/CD pipeline to dynamically whitelist temporary deployment runner IPs.
     - As an absolute fallback when dynamic IP whitelisting is not possible, restrict access using strong database user credentials (SCRAM-SHA-256 with minimum 24-character random password), enforce TLS 1.3, restrict database roles strictly to `readWrite` on the `sahayak` database only, and do not reuse admin credentials.

### 4.2 Redis Setup (Upstash / Redis Cloud)
1. Sign up at [Upstash](https://upstash.com/) or [Redis Cloud](https://redis.com/).
2. Create a standard Redis database (free tier works for initial deployment).
3. Copy the standard `redis://` connection URL to `REDIS_URL`.

### 4.3 LiveKit Voice Agent Worker Deployment
The LiveKit agent runs as an independent persistent background worker:
- Option A: Run on a cloud VM/container host using `Dockerfile.livekit`:
  ```bash
  docker build -t sahayak-livekit-worker:latest -f Dockerfile.livekit .
  docker run -d --env-file .env sahayak-livekit-worker:latest
  ```
- Option B: Run via a managed background worker on Render/Railway using start command:
  ```bash
  npm run livekit-agent
  ```

---

## 5. Telephony & Webhook Endpoints Documentation

Configure your Exotel App Bazaar flow with these production URLs:

1. **Exotel Voice Streaming WebSocket**:
   - URL: `wss://<your-backend-domain>/ws`
   - Authentication: Basic Auth (`EXOTEL_WS_USERNAME` / `EXOTEL_WS_PASSWORD`)
2. **Exotel DTMF Webhook**:
   - URL: `https://<your-backend-domain>/api/v1/voice/webhook`
   - Method: `POST`
   - Authentication: HTTP Basic Auth or Bearer token (`SAHAYAK_TOOL_SHARED_SECRET`)
3. **Sarvam Tool Webhook**:
   - URL: `https://<your-backend-domain>/api/v1/sarvam/emergency`
   - Method: `POST`
   - Header: `Authorization: Bearer <SARVAM_TOOL_SHARED_SECRET>`

---

## 6. Verification and Health Probes

Once deployed, verify your services using curl:

### 6.1 Liveness Probe (Checks process event loop)
```bash
curl -i https://<your-backend-domain>/health/live
# Expected: HTTP 200 {"status":"ok","uptime":...,"timestamp":"..."}
```

### 6.2 Readiness Probe (Checks MongoDB & Redis dependencies)
```bash
curl -i https://<your-backend-domain>/health/ready
# Expected: HTTP 200 {"status":"ready","checks":{"database":"connected","redis":"ready"},"timestamp":"..."}
```

### 6.3 CORS Verification
Test that your Vercel domain is accepted:
```bash
curl -i -H "Origin: https://sahayak-web.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS https://<your-backend-domain>/api/v1/health

# Expected response header:
# Access-Control-Allow-Origin: https://sahayak-web.vercel.app
```

And test that unauthorized origins are rejected:
```bash
curl -i -H "Origin: https://unauthorized-domain.com" \
  https://<your-backend-domain>/api/v1/health

# Expected: HTTP 403 Forbidden
```

---

## 7. Rollback Procedures

### 7.1 Vercel Frontend Rollback
1. Go to **Deployments** in your Vercel project.
2. Locate the previous working deployment.
3. Click the three dots (`...`) -> **Promote to Production** (instant rollback).

### 7.2 Backend Container Rollback
1. On Render/Railway: Go to **Deployments/Activity** -> Select the previous commit/image tag -> Click **Rollback**.
2. On Docker/Kubernetes:
   ```bash
   # Re-tag and deploy previous known-good image
   docker pull <registry>/sahayak-backend:<previous-stable-tag>
   docker tag <registry>/sahayak-backend:<previous-stable-tag> <registry>/sahayak-backend:latest
   docker-compose up -d --force-recreate
   ```

---

## 8. Environments Matrix

| Environment | Frontend URL | Backend URL | Database | Redis |
|---|---|---|---|---|
| **Local Development** | `http://localhost:3000` | `http://localhost:5000` | MongoDB Atlas / Local | Local (or optional) |
| **Vercel Preview** | `https://*-<team>.vercel.app` | `https://staging-api.yourdomain.com` | MongoDB Staging DB | Staging Redis |
| **Production** | `https://sahayak.vercel.app` | `https://api.yourdomain.com` | MongoDB Production DB | Production Redis |
