# Sahayak Phase 2 — GPS and Maps Integration Guide

## 1. Overview & Architectural Scope

Phase 2 adds reliable location support to Sahayak. It enables citizens to share browser GPS coordinates with explicit consent, stores location metadata with backward-compatible schemas, renders dynamic interactive maps via Leaflet and OpenStreetMap, and enforces IDOR protection so only authorized administrators and assigned volunteers can view sensitive incident coordinates.

All existing components (Express backend, React 19/Vite frontend, MongoDB Atlas persistence, deterministic volunteer assignment, LiveKit, Sarvam, and Exotel integrations) have been fully preserved without regression.

---

## 2. Location Data Contract

### Schema & Persistence Fields

All coordinates are persisted on the primary `assistance_requests` MongoDB document:

| Field Name | Type | Description | Required? | Example |
| :--- | :--- | :--- | :--- | :--- |
| `latitude` | `Number` | Decimal degrees latitude (WGS 84), range: `[-90, 90]` | Optional | `12.9716` |
| `longitude` | `Number` | Decimal degrees longitude (WGS 84), range: `[-180, 180]` | Optional | `77.6412` |
| `accuracy_meters` | `Number` | Browser-reported accuracy radius in meters, `>= 0` | Optional | `12.5` |
| `location_source` | `String` | Source identifier: `'browser_gps'`, `'manual_pin'`, `'caller_provided'`, `'geocoded'`, `'other'` | Optional | `'browser_gps'` |
| `location_captured_at`| `Date` | Timestamp when coordinates were captured | Optional | `2026-10-02T12:30:00Z` |
| `location_geojson` | `Object` | Standard GeoJSON Point `{ type: 'Point', coordinates: [lng, lat] }` for `2dsphere` query compatibility | Optional | `{ type: 'Point', coordinates: [77.6412, 12.9716] }` |
| `location_text` | `String` | Human-readable address, landmark, or description | Optional | `'12th Main Road, HAL 2nd Stage'` |

### Coordinate Validation Rules

Validated centrally via [src/utils/locationValidation.js](file:///c:/Users/ankita/Desktop/sahayak-final/src/utils/locationValidation.js):
1. **Backward Compatibility**: If neither `latitude` nor `longitude` is provided, validation passes (`hasCoordinates: false`), allowing text-only requests.
2. **Atomic Coordinates**: If either `latitude` or `longitude` is provided, both must be provided; partial coordinates are rejected with HTTP 400.
3. **Range Checks**:
   - Latitude: `-90 <= lat <= 90`, finite number.
   - Longitude: `-180 <= lng <= 180`, finite number.
4. **Accuracy**: If provided, must be a finite non-negative number (`>= 0`).
5. **No Coordinate Fabrication**: Text addresses are never converted to fake coordinates. Missing coordinates remain `null`.

---

## 3. Map Provider & Integration Details

### Provider Selection: Leaflet + OpenStreetMap (OSM)
- **Library**: `leaflet` (v1.9.4) + `@types/leaflet`.
- **Tile Provider**: OpenStreetMap Standard Tile Server (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`).
- **Cost**: **$0.00 / Free**. No paid subscription, billing account, or credit card required.
- **API Keys**: No API key required; zero risk of leaking private API keys in client bundles (`VITE_*`).
- **Attribution**: Meets OpenStreetMap attribution requirements:
  ```html
  &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors
  ```
- **Usage Policy Compliance**:
  - Tiles are accessed on-demand by client browsers.
  - Max zoom is constrained to 19.
  - Scroll-wheel zoom is disabled by default to avoid scroll trapping and excess tile queries.
  - In production high-scale deployments, custom self-hosted tiles or a low-cost commercial proxy (e.g. MapLibre / Stadia Maps / Protomaps) can be swapped into `IncidentMap.tsx` without modifying application logic.

### Reusable Map Component: `<IncidentMap />`
Located at [fornent end/src/components/IncidentMap.tsx](file:///c:/Users/ankita/Desktop/sahayak-final/fornent%20end/src/components/IncidentMap.tsx):
- **Dynamic Beacon**: Renders an animated pulse beacon at `[latitude, longitude]`.
- **Accuracy Radius**: Renders a translucent circle when `accuracyMeters` is available.
- **Fallback View**: When coordinates are missing, displays a fallback card with the text address and safe external search links.
- **External Navigation**: Provides safe `_blank` links to OpenStreetMap and Google Maps navigation (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`).
- **Manual Pin Correction**: Supports interactive clicking and dragging for manual pin refinement.

---

## 4. API Endpoints

### 1. `POST /api/v1/requests` (Police Admin / Dispatcher Ingest)
- **Auth**: Bearer JWT (`police_admin` role).
- **Body**: Accepts `category`, `urgency_level`, `description`, `location_text`, `latitude`, `longitude`, `accuracy_meters`, `location_source`, `location_captured_at`.
- **Response**: Returns created request with `latitude`, `longitude`, `currentAssignedVolunteerId`, and `queuePosition`.

### 2. `POST /api/v1/requests/citizen` (Public Citizen Emergency SOS)
- **Auth**: Public intake (no auth required; rate-limited).
- **Body**: Accepts `category`, `description`, `phone`, `location_text`, `latitude`, `longitude`, `accuracy_meters`, `location_source`.
- **Response**: Returns 201 Created with `{ requestId, status, emergency, latitude, longitude, location, message }`. Does not leak internal user records or responder identities.

### 3. `GET /api/v1/requests` & `GET /api/v1/requests/:id`
- **Police Admin**: Returns full request with coordinates, history, and assigned volunteer summary.
- **Volunteer**: Strictly filtered to requests assigned to the calling volunteer (`current_assigned_volunteer_id === volunteer._id`). Returns coordinates for the volunteer's assigned incident only.
- **IDOR Protection**: Unauthorized volunteers requesting another volunteer's incident receive `403 Forbidden`.

---

## 5. Security & Privacy Considerations

1. **Explicit User Consent**: Browser geolocation is only requested after the citizen clicks "Share My GPS Location".
2. **Single-Shot Capture**: Uses `navigator.geolocation.getCurrentPosition` (never `watchPosition`). Location is not continuously tracked in the background.
3. **No Geocoding PII Leaks**: Text addresses and incident transcripts are never forwarded to third-party geocoding providers.
4. **Access Control (IDOR Protection)**: Coordinates are accessible only to authorized Police Admins and the specific volunteer dispatched to that incident.

---

## 6. Verification & Automated Test Results

### Test Suite Execution
- **Backend Tests**: **147 tests across 7 suites — 147 passed, 0 failed**.
  - Includes 17 dedicated tests in [test/gpsAndLocation.test.js](file:///c:/Users/ankita/Desktop/sahayak-final/test/gpsAndLocation.test.js):
    1. Valid GPS coordinates and GeoJSON formatting.
    2. Out-of-bounds latitude (`> 90`, `< -90`).
    3. Out-of-bounds longitude (`> 180`, `< -180`).
    4. Non-finite coordinates (`NaN`, `Infinity`).
    5. Partial coordinates (latitude without longitude or vice versa).
    6. Negative accuracy rejection.
    7. Text-only requests with missing coordinates (backward compatibility).
    8. Manual pin and caller-provided location sources.
    9. Database persistence of exact coordinates and GeoJSON Point.
    10. Invalid coordinates rejected with HTTP 400.
    11. Status history preservation with coordinates.
    12. State transitions preserving coordinates.
    13. Unauthorized volunteer access prevention (IDOR).
    14. Police admin visibility access.
    15. Automatic volunteer assignment with coordinates.
    16. Dispatch queueing with coordinates.
    17. Queue promotion maintaining coordinate integrity.
- **Frontend Typecheck**: `tsc --noEmit` exited with code 0 (0 errors).
- **Frontend Build**: `vite build` completed successfully in 184ms.
