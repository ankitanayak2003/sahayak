# Sahayak (सहायक) — Intelligent Emergency Assistance & Coordination Platform

[![CI Backend Tests](https://img.shields.io/badge/Tests-165%20Passing-brightgreen.svg)](#testing)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite-blue.svg)](#frontend-setup)
[![Backend](https://img.shields.io/badge/Backend-Node.js%2020%20%7C%20Express-green.svg)](#backend-setup)
[![Database](https://img.shields.io/badge/Database-MongoDB%20Atlas%20%7C%20Redis-red.svg)](#database--cache)

**Sahayak** is an intelligent, multi-channel emergency assistance coordination platform designed to protect senior citizens and individuals in distress. It unifies one-click citizen web SOS, regional language voice AI telephony, interactive GPS mapping, automated volunteer dispatch, and distributed security controls into an enterprise emergency response workflow.

---

## 🌟 Key Capabilities

* **Instant Citizen SOS**: One-click browser emergency intake with optional browser GPS coordinates, address fallback, and voice description.
* **Interactive Incident Maps**: Dynamic Leaflet + OpenStreetMap maps featuring real-time pulse beacons, GPS accuracy radius overlays, and Google Maps driving navigation routing with zero external API key requirements.
* **AI Urgency Classification**: Incident severity analysis and disposition assessment powered by Google Gemini AI.
* **Deterministic Volunteer Dispatch**: Automated workload-balanced dispatch engine matching incidents to verified, available volunteers, with automated queue management when responders are busy.
* **Distributed Security & Anti-Abuse**:
  * Redis-backed OTP storage using HMAC-SHA256 keyed hashes with atomic Lua script single-use invalidation and 5-attempt brute-force lockout.
  * Distributed rate-limiting middleware protecting citizen SOS intake, volunteer OTP dispatch, and authentication endpoints.
  * Insecure Direct Object Reference (IDOR) protection on sensitive location coordinates.
  * Authenticated AES-256-GCM phone encryption with HMAC-SHA256 blind indexing.
* **Voice & Telephony Integration**: PSTN voice intake via Exotel, Sarvam AI regional language STT/TTS, and LiveKit Cloud conversational voice agent workers.

---

## 🏗️ Architecture

```
                       +---------------------------------------+
                       |   Vercel Global Edge Network          |
                       |   (React 19 + TypeScript + Vite)      |
                       |   Root Directory: 'fornent end'       |
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
        | (Primary Database)         |     | (Distributed State)          |     | (Conversational Voice Agent) |
        +------------------------------+     +------------------------------+     +------------------------------+
```

---

## 🚀 Quickstart & Setup

### Prerequisites
* **Node.js**: v20+ LTS
* **MongoDB**: MongoDB Atlas URI or local instance
* **Redis**: Redis 6+ / 7+ (or Upstash Redis URL)

### 1. Backend Setup
```bash
# Clone the repository
git clone https://github.com/ankitanayak2003/sahayak.git
cd sahayak

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB, JWT, and Redis connection details

# Start backend in development mode
npm run dev
```
The backend starts on `http://localhost:5000` with API routes mounted at `/api/v1`.

### 2. Frontend Setup
```bash
# Navigate to frontend directory
cd "fornent end"

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Default points to http://localhost:5000/api/v1

# Start frontend development server
npm run dev
```
The frontend is available at `http://localhost:3000`.

---

## 🧪 Testing

The repository includes a comprehensive automated test suite with zero external test runner dependencies (using Node.js's native `node --test`):

```bash
# Run backend test suite (165 tests)
npm test

# Run frontend TypeScript & lint check
cd "fornent end"
npm run lint

# Build frontend production bundle
npm run build
```

---

## 📖 Detailed Documentation

Comprehensive documentation is available in the [`docs/`](./docs) directory:
* [**Product Requirements Document (PRD)**](./docs/prd.md): Target users, workflows, and core feature specifications.
* [**System Architecture**](./docs/architecture.md): Data schemas, API specifications, voice pipelines, and dispatch engine.
* [**Project Rules & Security**](./docs/rules.md): Coding conventions, encryption standards, and operational guidelines.
* [**Task Tracking & Roadmap**](./docs/tasks.md): Verified completed phases, outstanding work, and milestones.
* [**Durable Context & Memory**](./docs/memory.md): Key decisions, Git branches, and developer reference.
* [**Production Deployment Guide**](./deploy/DEPLOYMENT.md): Step-by-step instructions for deploying to Vercel and Docker/Render.

---

## 📄 License

ISC License.
