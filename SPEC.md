# Singapore Wind — SPEC.md

**Project:** Singapore Wind  
**Type:** Mobile-first progressive web app (PWA)  
**Summary:** A cyclist-commuter tool that shows realtime wind speed/direction in Singapore and calculates headwind/tailwind impact based on the user's chosen cycling heading.  
**Target user:** Singapore cyclist commuting to/from work, planning route timing around wind conditions.  
**Hosting:** GitHub Pages (static, no server-side code)  
**Stack:** Vanilla JS (no framework), sql.js for local SQLite, CSS custom properties for theming

---

## 1. Concept & Vision

Singapore Wind is a no-nonsense cycling weather companion built for the morning and evening commute. It answers one question fast: *is today a headwind day?* The app prioritises speed of answer over data volume — a cyclist at the bus stop with 30 seconds to spare needs to glance and go. The personality is sharp, sporty, and quietly confident. No clutter, no ads, no charts that require a meteorology degree.

The app speaks cyclist: headwind km/h, not abstract pressure readings. It knows Singapore's geography and weather patterns. It runs fast because it has to.

---

## 2. Design Language

### Aesthetic Direction
**"Bright Sport"** — the visual language of a high-visibility cycling vest and a morning sky. Bold type, generous whitespace, colour used to communicate meaning (colour = data, not decoration). Light theme default; cycling apps need to be readable outdoors in sunlight.

### Colour Palette
```
--color-bg:          #F0F4F8   /* overcast sky, main background */
--color-surface:     #FFFFFF   /* card surface */
--color-primary:     #0F172A   /* ink, headings, primary text */
--color-secondary:   #475569   /* secondary text, labels */
--color-muted:       #94A3B8   /* hints, inactive states */

--color-wind:        #0EA5E9   /* sky blue — wind speed indicator */
--color-headwind:    #EF4444   /* red — bad headwind */
--color-tailwind:    #22C55E   /* green — good tailwind */
--color-crosswind:   #F59E0B   /* amber — partial crosswind */

--color-border:      #E2E8F0
--color-shadow:      rgba(15, 23, 42, 0.08)
```

### Typography
- **Display / numbers:** `DM Sans` (Google Fonts), weight 700 — for wind speed values and headings
- **Body / labels:** `DM Sans`, weight 400/500
- **Monospace (degree symbols, units):** `JetBrains Mono` — for precise numeric readouts
- Scale: 12 / 14 / 16 / 20 / 28 / 48px (minor third scale)
- Line height: 1.2 for display, 1.5 for body

### Spatial System
- Base unit: 4px
- Component padding: 16px (4 units)
- Card gap: 12px
- Section gap: 32px
- Card border-radius: 16px
- Touch target minimum: 44px

### Motion Philosophy
- **Micro-interactions only** — no decorative animation that slows perceived performance
- Card swipe: CSS scroll-snap with momentum, 60fps
- Value changes: CSS `transition: color 200ms ease` — colour shifts communicate data change
- Pull-to-refresh: spinner replaced by a simple fade-in of new data
- Loading skeletons: pulsing `--color-muted` at 10% opacity blocks, no spinners

### Visual Assets
- Icons: Lucide icons (inline SVG, 20px stroke-width 1.5)
- Wind arrow: custom SVG compass rose showing wind origin direction
- No photography, no illustrations — data IS the visual

---

## 3. Layout & Structure

### Page Architecture
Single-page app with **three swipeable cards** in a horizontal scroll-snap container (CSS `scroll-snap-type: x mandatory`). The three cards are:

1. **Now** — current conditions at a selected station
2. **Headwind** — headwind/tailwind calculation
3. **History** — past 7-day wind pattern at selected station

A fixed bottom navigation (3 dots) indicates which card is active. The entire viewport is dedicated to cards; no persistent header/footer takes up space.

### Responsive Strategy
- **Primary:** 375px–428px wide (iPhone SE to iPhone 15 Pro)
- **Secondary:** 320px (older Android devices)
- Cards fill viewport height minus safe-area insets
- Desktop: cards centred with max-width 480px, side padding on the container

### Visual Pacing
- Card 1 "Now": Maximum visual weight on the wind speed number (48px+). Direction arrow prominent.
- Card 2 "Headwind": Large directional indicator (animated arrow or arc), clear headwind/tailwind label.
- Card 3 "History": Sparkline bar chart, no axes, 7 bars for 7 days, colour-coded by intensity.

### Navigation
- Swipe left/right between cards
- Tap bottom dot to jump to a card
- No back button, no drawer — always one swipe away

---

## 4. Features & Interactions

### 4.1 Station Selection
- **On first launch:** Request geolocation (Geolocation API). Show 5 nearest NEA weather stations sorted by distance. User picks one; selection stored in `localStorage`.
- **Manual change:** A subtle "pin" icon on the station name opens a station picker modal — a searchable list of all available stations from the API station list, sorted alphabetically or by proximity if geolocation available.
- **Persistence:** Selected station ID and coordinates stored; on subsequent visits, load directly.

### 4.2 Realtime Wind Display (Card 1 — Now)
- Fetch `wind-speed` and `wind-direction` every **5 minutes** (configurable via `localStorage`, min 1 min, max 30 min).
- Show:
  - **Wind speed** in large type, default unit knots, toggleable to km/h or m/s via a small unit pill (Knots | km/h | m/s).
  - **Wind direction** as a compass arrow pointing in the direction the wind is **coming from** (meteorological convention: wind direction = where it originates). Label shows degrees (e.g., "045°") and cardinal (e.g., "NE").
  - **Station name** and last-updated timestamp (e.g., "Changi · 5 min ago").
- **Pull-to-refresh:** On Card 1, pulling down triggers an immediate API fetch.
- **Error state:** If API fails, show last-known values with a "Stale data" badge and timestamp.
- **Offline state:** Service Worker caches the last successful response; offline shows cached data with a banner.

### 4.3 Headwind / Tailwind Calculation (Card 2 — Headwind)
This is the core differentiator. The app calculates how much of the wind is working for or against the cyclist.

**Cyclist Heading Input:**
- A large circular compass rose UI element (150px diameter). User drags or taps to set their cycling direction. Heading stored in `localStorage`.
- Default: 0° (North). The last-used heading is persisted.
- The heading value is shown numerically (e.g., "Heading 045° East") and as a highlighted direction on the compass.

**Calculation:**
```
Wind angle relative to cyclist = windDirection − cyclistHeading
(adjusted to −180° to +180° range)
Headwind component = windSpeed × cos(windAngle)   [positive = headwind, negative = tailwind]
Crosswind component = |windSpeed × sin(windAngle)|
```
- Display:
  - **Primary label:** "HEADWIND", "TAILWIND", or "CROSSWIND" (crosswind when |crosswind| > |headwind| by ratio)
  - **Magnitude:** e.g., "12 knots" (the component speed, not total wind)
  - **Visual arc:** An arc on the compass rose shows the wind direction relative to the cyclist's heading — green arc for tailwind side, red arc for headwind side.
  - **Summary line:** e.g., "Winds from NE at 14kt. You're riding into an 11kt headwind."

**Crosswind threshold:** Crosswind label shown when crosswind component magnitude > headwind component magnitude AND > 5 knots.

### 4.4 Historical Wind Pattern (Card 3 — History)
- Uses the historical API (`collections/2280` for speed, `2281` for direction) to retrieve yearly CSV datasets.
- **On first load:** Fetch the current year's CSV for the selected station, parse with sql.js, store in IndexedDB (via sql.js in-memory DB persisted to IndexedDB blob).
- **Display:** Last 7 days of wind data, one bar per day. Bar height = average daily wind speed. Colour: `--color-wind` at low, `--color-headwind` above 50th percentile, `--color-tailwind` below 25th percentile.
- **Tap a bar:** Expand to show max, min, average for that day and dominant direction.
- **Empty state:** If no historical data loaded yet, show a single "Load history" button. Once loaded, cached for the session.
- **Loading state:** Skeleton bars (7 grey rectangles pulsing).

### 4.5 Settings (accessed via a gear icon that slides up a bottom sheet)
- **Units:** Wind speed preference (knots / km/h / m/s). Persisted.
- **Polling interval:** 1 / 5 / 15 / 30 minutes.
- **Clear cached data:** Wipe IndexedDB and localStorage.
- Settings sheet: swipe down or tap outside to dismiss.

### 4.6 Service Worker / Offline
- Cache static assets (HTML, CSS, JS, fonts, icons) on install.
- Cache the last successful realtime API response in Cache API.
- On offline, serve cached page + cached API data with an "Offline" banner.
- Background sync: not used (no writes to server).

---

## 5. Component Inventory

### 5.1 `WindCard` (container)
- White surface, 16px border-radius, `box-shadow: 0 2px 12px var(--color-shadow)`.
- Full viewport height minus safe-area-inset (env safe-area-inset-bottom).
- Padding: 24px horizontal, 16px vertical.
- States: default, loading (skeleton overlay), error (red border top 3px, error message below header).

### 5.2 `WindSpeedDisplay`
- Large numeral (48px, weight 700, DM Sans).
- Unit label (14px, JetBrains Mono, `--color-secondary`).
- States: live (normal), stale (amber tint on value), loading (skeleton numeral width ~80px).

### 5.3 `CompassArrow`
- Inline SVG arrow, 40px base, rotates via CSS `transform: rotate(Xdeg)` (computed from wind direction).
- Points in meteorological direction (where wind comes FROM).
- States: default (`--color-wind`), error (muted).

### 5.4 `HeadingSelector`
- Circular SVG compass, 150px diameter, stroke-only with cardinal labels (N/E/S/W).
- A draggable handle (12px circle, `--color-primary`) sets cyclist heading.
- Active heading direction highlighted in `--color-primary`.
- States: idle, dragging (handle scales 1.2×), locked (when another interaction is active).

### 5.5 `HeadwindArc`
- SVG arc drawn over the HeadingSelector compass. Semi-circle from cyclist's heading ± 90°.
- Tailwind side arc: `--color-tailwind` at 30% opacity fill.
- Headwind side arc: `--color-headwind` at 30% opacity fill.
- The actual wind direction shown as a line from centre.

### 5.6 `HeadwindBadge`
- Large pill showing "HEADWIND", "TAILWIND", or "CROSSWIND".
- Background: `--color-headwind` (headwind), `--color-tailwind` (tailwind), `--color-crosswind` (crosswind).
- Text: white, 14px weight 700.

### 5.7 `SparklineChart`
- 7 vertical bars, equal width, 4px gap, max height 80px.
- Bar width: `(card-width - 48px - 24px) / 7 - 4px`.
- Tap interaction: bar expands slightly, tooltip shows value.
- States: loaded (coloured bars), loading (grey skeletons), empty ("No history available").

### 5.8 `StationPicker`
- Modal bottom sheet (slides up, 70% viewport height).
- Search input at top (filters station list by name).
- Scrollable list of station items: station name + distance (if geolocation) or just name.
- Selected station: checkmark icon, `--color-primary` text.
- Dismiss: swipe down or tap scrim.

### 5.9 `UnitToggle`
- Pill-shaped segmented control, 3 segments: Knots | km/h | m/s.
- Selected: `--color-primary` background, white text. Unselected: transparent, `--color-secondary`.
- 44px height, full-width in settings context.

### 5.10 `SettingsSheet`
- Bottom sheet, max 60vh, draggable handle at top.
- List of setting rows: label left, control right.
- Sections: Units, Refresh, Data, About.

### 5.11 `RefreshBanner`
- Fixed top banner, `--color-crosswind` background, "Offline — showing cached data". Slides down 44px when offline, slides up when back online.

### 5.12 `LastUpdated`
- Small text: "Changi · 5 min ago" or "Changi · Updated 21:40".
- `--color-muted`, 12px, below station name.

### 5.13 `BottomNavDots`
- 3 dots (8px circles), fixed bottom centre, 16px from bottom.
- Active dot: `--color-primary`, 100% opacity. Inactive: `--color-muted`, 40% opacity.
- Spacing: 8px between dots.

---

## 6. Technical Approach

### 6.1 File Structure
```
/
├── index.html           # Single HTML entry, minimal shell
├── css/
│   └── styles.css       # All styles, CSS custom properties
├── js/
│   ├── app.js           # Main entry, card controller, swipe logic
│   ├── api.js           # Fetch wrappers for NEA realtime + historical APIs
│   ├── wind.js          # Wind math: headwind/tailwind/crosswind calculations
│   ├── db.js            # sql.js setup, historical data load/parse/cache
│   ├── geo.js           # Geolocation, Haversine distance to stations
│   ├── ui.js            # DOM rendering functions per component
│   └── state.js         # Simple pub/sub state store (selectedStation, heading, windData, etc.)
├── sw.js                # Service Worker
└── manifest.json        # PWA manifest
```

### 6.2 State Management
Lightweight pub/sub store in `state.js`. State shape:
```js
{
  station: { id, name, lat, lon },
  cyclistHeading: 0,          // degrees 0-359
  windSpeed: null,             // knots
  windDirection: null,        // degrees meteorological
  windTimestamp: null,        // ISO string
  historicalData: [],         // [{date, avgSpeed, maxSpeed, minSpeed, dominantDirection}]
  unit: 'knots',              // 'knots' | 'kmh' | 'ms'
  pollingInterval: 5 * 60 * 1000,
  isOnline: true,
  isLoading: { now: false, history: false }
}
```

### 6.3 API Integration

**Realtime endpoints (NEA Open Data API — no auth for these):**
```
GET https://api-open.data.gov.sg/v2/real-time/api/wind-speed
GET https://api-open.data.gov.sg/v2/real-time/api/wind-direction
```
Both return JSON with `stations` array and `readings` array. The most recent `readings[0]` is the latest.

**Parsing:** `windSpeed` is the `value` from wind-speed reading. `windDirection` is the `value` from wind-direction reading, degrees meteorological (0 = North = where wind originates, 90° = East).

**Nearest-station match:** The wind-speed and wind-direction readings both contain `stationId`. Match against the stations list from the API response. If the user's selected station has no current reading, fall back to the first station with data.

**CORS:** The NEA API supports CORS (public API). No proxy needed.

**Rate limit note:** Polling at ≤5-minute intervals is safe. App defaults to 5 min. Warn user if they set <1 min.

**Historical data:**
```
GET https://api-production.data.gov.sg/v2/public/api/collections/2280/metadata   # speed
GET https://api-production.data.gov.sg/v2/public/api/collections/2281/metadata   # direction
```
Metadata returns child datasets with annual CSV download URLs. Pattern:
```
GET https://api-production.data.gov.sg/v2/public/api/datasets/{id}/download
```
CSV columns include station_id, date, mean_wind_speed (or direction). The app fetches the current year dataset for the selected station only.

### 6.4 sql.js / Historical Data
- Load sql.js from CDN (`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js`) with the WASM file from same CDN.
- Create an in-memory SQLite DB. On CSV parse, insert rows for the selected station.
- Persist the DB to IndexedDB as a binary blob (key: `wind_history_{stationId}`).
- On app load: open IndexedDB, load blob into sql.js, run query for last 7 days.
- If no blob exists: fetch/parse CSV → store blob → run query.
- CSV fetch is done once per session (or until cache is cleared).

### 6.5 Unit Conversions
```
knots → km/h:  × 1.852
knots → m/s:   × 0.514444
km/h  → knots: ÷ 1.852
m/s   → knots: ÷ 0.514444
```

### 6.6 Geolocation
- Use `navigator.geolocation.getCurrentPosition()` on first launch.
- Calculate distance to each NEA station using Haversine formula in `geo.js`.
- Sort stations by distance; show top 5 as suggestions.
- Store `{lat, lon}` in localStorage; recalculate distances when station list changes.

### 6.7 Service Worker Strategy
- **Cache-first** for static assets (HTML, CSS, JS, fonts).
- **Network-first, cache-fallback** for realtime API responses (max cache age: 1 hour).
- Cache name versioned: `sw-v1` → `sw-v2` on deploy (invalidate old cache).

### 6.8 PWA Manifest
```json
{
  "name": "Singapore Wind",
  "short_name": "SG Wind",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F0F4F8",
  "theme_color": "#0F172A",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 6.9 External Dependencies (CDN)
- sql.js 1.10.3 + WASM
- DM Sans (Google Fonts)
- JetBrains Mono (Google Fonts)
- Lucide icons (inline SVG, no CDN — copied as needed)

### 6.10 Browser Support
- Chrome 90+, Safari 15+, Firefox 90+.
- No IE11.
- HTTPS required (Service Worker requirement) — GitHub Pages provides HTTPS.

---

## 7. Acceptance Criteria

### AC1 — Realtime Wind Display
- [ ] On load, app fetches wind-speed and wind-direction from NEA realtime APIs.
- [ ] Wind speed displays correctly in knots by default.
- [ ] Unit toggle changes all displayed values (speed + headwind magnitude) instantly.
- [ ] Compass arrow rotates to show correct meteorological wind direction.
- [ ] "Last updated" timestamp updates after each fetch.

### AC2 — Station Selection
- [ ] First launch triggers geolocation prompt.
- [ ] 5 nearest stations shown sorted by distance.
- [ ] User can search all stations by name.
- [ ] Selected station persists across page refreshes (localStorage).

### AC3 — Headwind Calculation
- [ ] Dragging the heading selector updates cyclist heading in real time.
- [ ] Headwind/tailwind/crosswind label correctly reflects the math.
- [ ] Magnitude shown is the component speed (not total wind speed).
- [ ] Headwind arc visually distinguishes tailwind (green) vs headwind (red) sides.
- [ ] Summary sentence accurately describes the conditions.

### AC4 — Historical Data
- [ ] App fetches and parses current year's CSV for selected station.
- [ ] Last 7 days display as 7 bars in Card 3.
- [ ] Historical data persists to IndexedDB; subsequent visits don't re-fetch.
- [ ] Tapping a bar shows day detail (avg, max, min, dominant direction).

### AC5 — Offline / Cached
- [ ] Service Worker caches static assets on first visit.
- [ ] Last successful realtime response is cached.
- [ ] Offline banner appears when network unavailable; stale data shown.

### AC6 — Mobile UX
- [ ] Cards swipe horizontally with CSS scroll-snap, no jank.
- [ ] All touch targets ≥44px.
- [ ] Keyboard accessible: Tab navigates cards, arrow keys change heading.
- [ ] Safe area insets respected on notched devices.

### AC7 — PWA
- [ ] `manifest.json` present; app installable on Android/Chrome OS.
- [ ] Service Worker registered; app works offline.
- [ ] App icon renders correctly at 192×192 and 512×512.

---

## Appendix: Key Definitions

| Term | Definition |
|---|---|
| **Meteorological wind direction** | Degrees clockwise from North, indicating where the wind **originates**. A 45° wind is from the northeast, blowing toward the southwest. |
| **Cyclist heading** | Degrees clockwise from North, indicating the direction the cyclist is **travelling**. |
| **Headwind component** | `windSpeed × cos(windAngle)` where `windAngle = windDir − cyclistHeading`. Positive = headwind. |
| **Crosswind component** | `|windSpeed × sin(windAngle)|`. Lateral wind force. |
| **Tailwind** | Headwind component is negative (wind pushing from behind). |
| **Crosswind** | Crosswind magnitude > headwind magnitude AND crosswind > 5 knots. |
