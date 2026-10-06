# Sahayak (सहायक) — Frontend Design System & UI Specifications

This document details the visual design system, color palette, typography hierarchy, component specifications, responsive behaviors, and accessibility practices implemented across the Sahayak frontend application (`fornent end/`).

---

## 1. Design Principles

1. **Emergency-First Visual Hierarchy**:
   Critical emergency information, urgent dispatch alerts, and life-safety actions are given immediate prominence through high-contrast crimson accents, animated radar beacons, and bold display headers. Secondary telemetry and administrative metadata remain structured and calm to prevent cognitive overload.
2. **Zero-Friction Citizen Access**:
   Citizens facing distress or panic can initiate an emergency SOS in a single click without remembering passwords, filling out long multi-step questionnaires, or waiting for account verification. The interface accepts explicit one-touch browser GPS sharing and provides an always-editable text address fallback.
3. **Calibrated Operational Clarity for Responders**:
   Police dispatchers and community volunteers require rapid situational awareness. The dashboard organizes incidents into clear severity tiers (Critical, Urgent, Normal) with distinct color coding, dedicated status badges, direct turn-by-turn driving navigation deep-links, and deterministic queue indicators.
4. **Transparent State Feedback**:
   Every state transition — GPS satellite acquisition, verification status, duty availability, CAD dispatch confirmation, and error boundaries — is explicitly communicated with dedicated banners, loading spinners, and status badges.
5. **Clean Government-Grade Palette**:
   The visual aesthetic blends authoritative deep navy and cobalt blue tones with a crisp off-white background and high-visibility emergency crimson, conveying institutional credibility, trust, and operational efficiency.

---

## 2. Colour Palette

All colors are extracted directly from the application's CSS tokens (`fornent end/src/index.css`) and Tailwind classes across the component hierarchy.

### 2.1 Primary & Brand Colours
* **Sahayak Primary Blue (`#0051d5`)**: Primary brand color, used for primary navigation links, active tab highlights, primary buttons, GPS telemetry highlights, and normal severity indicators.
* **Sahayak Blue Hover (`#003ea8`)**: Darker blue shade used for button hover and active states.
* **Deep Slate Emblem (`#0f172a`)**: Base background for the official Sahayak shield emblem and main authentication submit buttons.
* **Slate Emblem Hover (`#1e293b`)**: Hover state for deep slate buttons.
* **Command Dark (`#000000` / `#213145`)**: Used for high-impact action buttons (e.g., "Action This Emergency", "Broadcast Code Red").

### 2.2 Secondary & Surface Tint Colours
* **Light Accent Blue (`#d3e4fe`)**: Used for text selection (`selection:bg-[#d3e4fe]`), incident count pill badges, and resolved status badges.
* **Soft Tint Blue (`#eff4ff`)**: Ubiquitous background tint for form inputs, table headers, notification button hover states, summary callouts, and icon boxes.
* **Subtle Structural Blue (`#dce9ff`, `#e5eeff`)**: Used for card divider borders, header bottom border, sidebar right border, and active sidebar item backgrounds.
* **Light Badge Blue (`#dbe1ff`)**: Background for Normal severity status tags and active status chips.

### 2.3 Background Colours
* **Global Body Background (`#f8f9ff`)**: Crisp, cool off-white background set on the `body` tag in `index.css`.
* **Surface Container (`#ffffff`)**: Pure white background for cards, tables, modals, the fixed header, and the sidebar.
* **Modal Overlay (`rgba(0, 0, 0, 0.6)`)**: Backdrop overlay with `backdrop-blur-xs` for emergency modals.
* **Mobile Drawer Overlay (`rgba(0, 0, 0, 0.4)`)**: Backdrop overlay with `backdrop-blur-2xs` for mobile sidebar drawers.

### 2.4 Text Colours
* **Primary Deep Navy (`#0b1c30`)**: Main text color for headings, titles, labels, and primary body content (`color: #0b1c30` in `index.css`).
* **Secondary Slate (`#45464d`)**: Used for secondary text, descriptions, inactive navigation labels, and subtitles.
* **Muted Grey (`#76777d`)**: Used for uppercase section headers, metadata captions, timestamps, and input placeholders.
* **Inverse White (`#ffffff`)**: Pure white text for buttons, emergency badges, and status chips.

### 2.5 Status Colours
* **Verified / Safe Green (`#006e1c` text, `#d4f8d3` background)**: Used for "GPS Locked" telemetry badges and verified status indicators.
* **Normal / Controlled Blue (`#0051d5` text, `#dbe1ff` background)**: Used for Priority 3 Normal severity incidents and active roster status.
* **Urgent / Expedited Orange (`#f63a35` / `#c2410c` text, `#ffedd5` background, `#fed7aa` border)**: Used for Priority 2 Urgent tier incidents and queued dispatch notices.
* **Standby / Inactive Grey (`#76777d` text, `#cbd5e1` background)**: Used for off-duty status, inactive switches, and scrollbar track thumbs (`#cbd5e1`, hover `#94a3b8`).

### 2.6 Emergency & Alert Colours
* **Emergency Crimson (`#ba1a1a`)**: Primary emergency color used for the Citizen SOS button, Critical tier incidents, 112 escalation tags, unread notification counters, and the map radar beacon.
* **Emergency Crimson Hover (`#93000a`)**: Hover state for emergency dispatch buttons.
* **Emergency Light Tint (`#ffdad6`)**: Background for critical alert banners, error callouts, and incident severity badges.
* **Radar Pulse Beacon Glow (`rgba(186, 26, 26, 0.35)`)**: Radial pulse animation for Leaflet incident map markers.
* **Emergency Gradient (`linear-gradient(to right, #ba1a1a, #de3730)`)**: Banner background for urgent help prompts on the login screen.

---

## 3. Typography

Fonts are imported via Google Fonts in `fornent end/index.html` and configured via Tailwind CSS `@theme` in `fornent end/src/index.css`.

### 3.1 Font Families
* **UI & Body (`--font-sans`)**: `'Inter', system-ui, -apple-system, sans-serif`
  Weights loaded: 400 (Regular), 500 (Medium), 600 (Semi-bold), 700 (Bold).
* **Headings & Display (`--font-display`)**: `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`
  Weights loaded: 500 (Medium), 600 (Semi-bold), 700 (Bold), 800 (Extra-bold). Applied globally to `h1`–`h6` and `.font-display`.
* **Telemetry & Codes (`--font-mono`)**: `'JetBrains Mono', monospace`
  Weights loaded: 400 (Regular), 500 (Medium), 600 (Semi-bold). Used for incident IDs, GPS coordinates, and raw timestamps.
* **System Iconography**: `Material Symbols Outlined` (Google Material Symbols, variable font with `opsz 24`, `wght 400`).

### 3.2 Hierarchy & Typographic Scales
* **Page Titles (H1)**: `text-3xl font-bold font-display text-[#0b1c30] tracking-tight`
* **Section Titles (H2)**: `text-xl font-bold font-display text-[#0b1c30]`
* **Card / Modal Headings (H3)**: `text-lg font-bold font-display text-[#0b1c30]`
* **KPI / Metric Counters**: `text-4xl font-extrabold font-display leading-none`
* **Standard Body Text**: `text-sm text-[#0b1c30] leading-relaxed`
* **Secondary / Descriptive Text**: `text-xs text-[#45464d] leading-normal`
* **Field Labels**: `text-xs font-semibold text-[#0b1c30]`
* **Section Kicker / Subtitle**: `text-[11px] font-bold text-[#76777d] uppercase tracking-wider`
* **Button Text**: `text-xs font-bold uppercase tracking-wider`
* **Telemetry / Coordinates**: `text-xs font-mono font-bold text-[#0051d5]`

---

## 4. UI Components

### 4.1 Header (`Header.tsx`)
* Fixed top navigation bar: height 64px (`h-16`), z-index 50, background `#ffffff`, border bottom `border-[#e5eeff]`, subtle box shadow `shadow-[0_1px_8px_rgba(0,0,0,0.04)]`.
* Left section: Mobile hamburger drawer toggle button (`md:hidden`) and official Sahayak logo.
* Right section:
  - Role pill badge: `POLICE COMMAND` (`bg-[#dce9ff] text-[#0051d5]`) or `VOLUNTEER` (`bg-[#e5eeff] text-[#45464d]`).
  - Notification icon button with unread counter bubble (`bg-[#ba1a1a] text-white`).
  - Popover dropdowns for unread notifications and user profile session management.

### 4.2 Sidebar Navigation (`Sidebar.tsx`)
* Fixed left sidebar: width 256px (`w-64`), top 64px (`top-16`), bottom 0, background `#ffffff`, border right `border-[#e5eeff]`.
* Section kickers: `text-[11px] font-bold text-[#76777d] uppercase tracking-wider` ("Admin Console" or "Volunteer Portal").
* Navigation links: Rounded items (`rounded-lg px-3.5 py-2.5 text-sm`) with leading Material Symbols icon.
  - Active item: `bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs`.
  - Inactive item: `text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]`.
* Role-specific menus:
  - Admin: Dashboard, Emergency Requests, Volunteer Approvals, Volunteer Management.
  - Volunteer: Dashboard, My Requests, Profile.

### 4.3 Brand Logo (`Logo.tsx`)
* Official emblem: Shield shape with inset emergency cross in an `#0f172a` rounded dark container (`p-1.5 shadow-sm`).
* Typography: "SAHAYAK" in uppercase Plus Jakarta Sans display font with configurable size variants (`sm`, `md`, `lg`) and subtitle.

### 4.4 Interactive Incident Map (`IncidentMap.tsx`)
* Built with Leaflet 1.9.4 and OpenStreetMap raster tile layer. Zero external API keys.
* High-visibility SVG beacon:
  - Outer animated pulse circle: `width: 34px, height: 34px`, background `rgba(186, 26, 26, 0.35)`, CSS `animation: ping 1.5s infinite`.
  - Inner pin: `width: 26px, height: 26px`, background `#ba1a1a`, border `2.5px solid #ffffff`, box shadow `0 4px 6px -1px rgba(0,0,0,0.3)` with centered map marker icon.
* Accuracy radius overlay: Translucent circle drawn with Leaflet `L.circle` using `color: '#ba1a1a', weight: 1.5, opacity: 0.6, fillColor: '#ba1a1a', fillOpacity: 0.12`.
* Manual pin correction: Interactive draggable marker (`draggable: true`) with `dragend` callback for refining coordinates.
* External navigation: One-click deep-link opening Google Maps driving directions in a new tab:
  `https://www.google.com/maps/dir/?api=1&destination=lat,lng`.

### 4.5 Citizen Emergency SOS Modal (`CitizenEmergencyModal.tsx`)
* Modal container: Centered floating card with `rounded-2xl shadow-2xl max-w-lg w-full p-6 md:p-7 border border-[#e2e8f0]`.
* Category grid: 3-column button grid for incident categories (Life Threat, Medical / Health, Fall / Senior, Accident / Transit, Other Urgent). Active category highlighted with `border-[#ba1a1a] bg-[#ffdad6]/40 text-[#ba1a1a] font-bold`.
* Explicit GPS control box: Single-shot `navigator.geolocation.getCurrentPosition` trigger button, real-time acquisition spinner, locked coordinate badge (`#006e1c` on `#d4f8d3`), and optional embedded pin adjustment map.
* Form inputs: Editable text landmark address, optional phone number, and brief description.
* Emergency dispatch button: `bg-[#ba1a1a] hover:bg-[#93000a] text-white font-bold uppercase tracking-wider shadow-md`.
* Confirmation receipt: Ingestion confirmation card displaying 6-character incident reference ID, status tag, and 112 dialing reminder.

### 4.6 Metric & Severity Cards
* 3-tier severity cards on the Police Admin dashboard with colored left border indicators:
  - Critical: Border indicator `#ba1a1a`, badge `bg-[#ffdad6] text-[#ba1a1a]`, number `text-[#ba1a1a]`.
  - Urgent: Border indicator `#f63a35`, badge `bg-[#ffdad6] text-[#f63a35]`, number `text-[#f63a35]`.
  - Normal: Border indicator `#0051d5`, badge `bg-[#dbe1ff] text-[#0051d5]`, number `text-[#0051d5]`.
* Interactive: Clicking a card toggles filtering of the main incident dispatch stream table.

### 4.7 Tables & Incident Stream
* Rounded container with header band `bg-[#eff4ff]` and border `border-[#dce9ff]`.
* Table rows: White background, subtle bottom divider `border-[#f1f5f9]`, hover highlight `hover:bg-[#f8f9ff]`, pointer cursor for navigating to detailed views.
* Columns: Request ID (monospace with status dot), Category (icon + title), Severity (color pill), Status (action icon + badge), Actions button.

### 4.8 Duty & Readiness Toggle
* Switch control on the Volunteer Operations Console:
  - Toggle track: `w-12 h-6 rounded-full relative transition-colors`. Background `#0051d5` when On Duty; `#cbd5e1` when Off Duty.
  - Toggle thumb: `w-5 h-5 bg-white rounded-full shadow-md transition-transform`. Shifts right by `translate-x-6` when active.
  - Accompanying live telemetry dot: Pulsing blue indicator for on-duty readiness.

---

## 5. Responsive Design

The application uses standard Tailwind CSS breakpoint utilities:
* `sm`: 640px
* `md`: 768px
* `lg`: 1024px
* `xl`: 1280px

### 5.1 Mobile Adaptation Behaviors
1. **Navigation & Off-Canvas Drawer**:
   On viewports below `768px` (`md`), the persistent sidebar is hidden off-screen (`-translate-x-full`). Tapping the header hamburger icon slides the drawer into view (`translate-x-0`) with a dimmed backdrop (`bg-black/40 backdrop-blur-2xs`). Selecting any navigation item automatically closes the drawer.
2. **Metric & Summary Cards**:
   On mobile devices, 3-column metric cards stack into a single column (`grid-cols-1 md:grid-cols-3 gap-5`).
3. **Emergency Incident Details**:
   The volunteer primary emergency card stacks the triage summary and map frame vertically on mobile (`flex-col`), expanding to a side-by-side grid (`lg:grid-cols-12`) on desktop viewports.
4. **Data Tables**:
   All tabular data streams are wrapped with `overflow-x-auto`, ensuring full column visibility through smooth horizontal scrolling on narrow screens without breaking layout boundaries.
5. **Modal Windows**:
   Modals maintain responsive padding (`p-4` viewport inset, `p-6 md:p-7` inner card padding), vertical scroll handling (`overflow-y-auto`), and automatic width capping (`max-w-lg w-full`).

---

## 6. Accessibility Practices

1. **Semantic HTML Structure**:
   Uses standard semantic HTML5 elements including `<header>`, `<nav>`, `<aside>`, `<main>`, `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`, `<button>`, `<form>`, `<input>`, `<label>`, and `<textarea>`.
2. **Explicit Form Labeling**:
   Form controls use corresponding `<label>` tags with matching `htmlFor` and input `id` attributes (e.g. `htmlFor="identity-email"` linked to `id="identity-email"`).
3. **Accessible Button Attributes**:
   All interactive buttons specify explicit `type="button"` or `type="submit"`. Icon-only buttons include descriptive `title` attributes (e.g. `title="Toggle Menu"`, `title="Close dialog"`, `title="Notifications"`).
4. **State Announcements**:
   Interactive controls include ARIA state attributes where applicable, such as `aria-pressed={onDuty}` on the readiness toggle switch.
5. **Visible Focus Rings**:
   Form inputs, textareas, and interactive buttons feature distinct focus outlines (`focus:ring-2 focus:ring-[#0051d5] focus:outline-none`) to assist keyboard navigation.
6. **High Color Contrast Ratios**:
   Text colors strictly pair high-contrast tones against their backgrounds:
   - Deep navy text (`#0b1c30`) on white (`#ffffff`) and soft blue (`#eff4ff`) surfaces.
   - Emergency crimson (`#ba1a1a`) on pale pink (`#ffdad6`) alert badges.
   - White text (`#ffffff`) on solid cobalt (`#0051d5`), dark slate (`#0f172a`), and crimson (`#ba1a1a`) buttons.
7. **Graceful Degraded Fallbacks**:
   When browser GPS is unsupported or permission is denied, the application displays clear explanatory text and enables users to complete the emergency SOS via standard keyboard-accessible text address inputs.
