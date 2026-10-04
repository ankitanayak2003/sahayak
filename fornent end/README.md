# Sahayak Frontend Application

React 19 + TypeScript Single-Page Application (SPA) for the Sahayak Emergency Assistance Platform.

## Features
* **Citizen Emergency Intake Modal**: One-click SOS with optional browser geolocation (`navigator.geolocation`).
* **Interactive Incident Map**: Leaflet and OpenStreetMap visualization with live radar beacons and accuracy circles.
* **Police Administration Portal**: Real-time triage, 112 escalation tracking, and volunteer vetting.
* **Volunteer Portal**: Active assignment management, driving navigation, and task resolution.

## Local Development
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Set VITE_API_BASE_URL to your backend API URL (default: http://localhost:5000/api/v1)

# Start development server
npm run dev

# Lint & Typecheck
npm run lint

# Production Build
npm run build
```

## Vercel Deployment
* **Framework Preset**: Vite
* **Root Directory**: `fornent end`
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Environment Variables**: Set `VITE_API_BASE_URL` in Vercel project settings to your deployed backend API URL.
