# ◈ NEXRAD 3D

A high-performance 3D radar visualization tool for NEXRAD WSR-88D Level II data. Explore storm structure in full 3D on a live satellite globe, with support for all dual-polarization moments, elevation angle selection, and direct access to NOAA's public radar archive.

---

## Features

- **3D globe rendering** — Cesium.js globe with satellite, street, terrain, and dark map styles
- **Full dual-pol support** — REF, VEL, SW, ZDR, PHI, RHO with NWS-standard colormaps
- **NOAA archive access** — Browse and download any scan from the public `unidata-nexrad-level2` S3 bucket (1991–present)
- **Smart elevation selector** — Cuts grouped by angle, multi-select, sorted lowest to highest
- **Moment info panel** — Plain-English descriptions and context-aware filters per product
- **Notable events** — One-click download of pre-defined weather events
- **Scan timeline** — Chip-based ±5 scan navigator (configurable to ±3 or ±10) color-coded by cache status; green = instant load, amber = fast load, gray = fetch on demand
- **Keyboard navigation** — Arrow keys step through scans; number keys switch moments
- **Session persistence** — Elevation, moment, and filter settings carry over between scans
- **Live weather mode** — CURRENT tab polls the NOAA archive for the latest scans at one or more watched sites, auto-downloads them on a configurable interval, and keeps a rolling window of cached scans with automatic cleanup
- **Memory efficient** — Three-layer cache (server parse → client parse → GPU geometry) with LRU eviction; geometry cache embeds parse data so cached scans never trigger a server round-trip

---

## Requirements

- [Node.js](https://nodejs.org) v16 or newer
- A free [Cesium Ion](https://cesium.com/ion/signup) access token

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/nexrad3d.git
cd nexrad3d

# 2. Install server dependencies
cd server && npm install && cd ..

# 3. Set up your Cesium token
cp config.template.json config.json
# Edit config.json and add your token from cesium.com/ion/signup

# 4. Start the server
bash start.sh

# 5. Open http://localhost:3000
```

> **Windows:** Run `start.sh` in Git Bash, or `node --max-old-space-size=1536 server/index.js` directly.

---

## Project Structure

```
nexrad3d/
├── server/
│   ├── index.js                  # Express server — static file serving, NOAA S3 proxy,
│   │                             #   radar parse API, LRU parse cache, parse lock
│   └── package.json              # Server dependencies (express, cors, axios,
│                                 #   nexrad-level-2-data, multer)
│
├── client/
│   ├── index.html                # Single-page app shell — loads Cesium/Three.js globals
│   │                             #   as regular scripts, then bootstraps app.js as ES module
│   ├── css/
│   │   └── style.css             # Full UI stylesheet — dark theme, sidebar, topbar,
│   │                             #   scan chip timeline, modal, colorbars, toasts
│   └── js/
│       ├── app.js                # Application orchestrator — file loading, scan navigation,
│       │                         #   three-layer cache coordination, event listener wiring
│       ├── radar3d.js            # Cesium + Three.js hybrid renderer — point cloud geometry
│       │                         #   builder, geometry LRU cache (with embedded parse data),
│       │                         #   elevation/moment/render-settings management
│       ├── colormaps.js          # NWS-standard color lookup tables for all dual-pol moments
│       │                         #   (REF, VEL, SW, ZDR, PHI, RHO); loaded as global script
│       ├── state.js              # Shared application state object and client-side LRU parse
│       │                         #   cache (getCachedParsed, setCachedParsed, hasCachedParsed,
│       │                         #   clearParsedCache)
│       ├── api.js                # Server base URL constant (API = 'http://localhost:3000/api')
│       ├── utils.js              # DOM helpers ($), ICAO extraction, filename metadata parsing,
│       │                         #   toast notifications, loading bar, tab switching
│       ├── data/
│       │   ├── sites.js          # NEXRAD_SITES — 127 WSR-88D station records with ICAO,
│       │   │                     #   name, state, latitude, and longitude
│       │   ├── moments.js        # MOMENTS array and MOMENT_INFO map — display names,
│       │   │                     #   units, descriptions, and filter config per dual-pol product
│       │   └── events.js         # WEATHER_EVENTS — curated notable storm events with site
│       │                         #   ICAO, date, and UTC time window for batch download
│       └── ui/
│           ├── moment-panel.js   # Moment selector grid, colorbar canvas, moment info panel
│           │                     #   (description + context-aware filter controls)
│           ├── elevation.js      # Elevation angle list — cut grouping, submenu toggling,
│           │                     #   multi-select, sync with active scan
│           ├── current.js        # Live weather mode — site watch list, S3 polling loop,
│           │                     #   rolling file download/cleanup, geometry pre-warming
│           ├── files.js          # Local file list — renders cached scans, handles upload
│           │                     #   drop zone, file deletion (dispatches custom DOM event)
│           ├── s3.js             # S3 file browser — renders NOAA archive listing,
│           │                     #   triggers per-file download to local cache
│           └── events.js         # Notable events panel — event cards, per-site download
│                                 #   status badges, batch scan download with progress
│
├── data/                         # Cached radar files — git-ignored, auto-created on first run
├── config.json                   # Local config containing Cesium Ion token (git-ignored)
├── config.template.json          # Config template to copy when setting up
├── start.sh                      # Bash startup script — checks Node.js, installs deps,
│                                 #   creates data dir, starts server with --max-old-space-size
├── .gitignore
└── README.md
```

---

## Configuration

### Cesium Token

Get a free token at [cesium.com/ion/signup](https://cesium.com/ion/signup) (the free tier is sufficient).

```bash
cp config.template.json config.json
# Edit config.json and paste your token:
# { "cesiumToken": "your_token_here" }
```

`config.json` is git-ignored so your token is never committed. Alternatively, set the `CESIUM_TOKEN` environment variable:

```bash
CESIUM_TOKEN=your_token node server/index.js
```

### Port

Defaults to `3000`. Override with:

```bash
PORT=8080 bash start.sh
```

---

## Usage

### Fetching Data

1. **FETCH tab** → enter a site ICAO + date, or pick a Notable Event
2. Click **LIST AVAILABLE FILES** to browse the NOAA archive
3. Click **↓ GET** to download a scan to your local cache

### Viewing

1. **FILES tab** → click **LOAD** on any cached scan
2. **DISPLAY tab** → switch moments, select elevation angles, adjust point size / opacity / height scale
3. Use the **scan timeline** in the topbar to see and jump between adjacent scans

### Live Weather (CURRENT tab)

1. Enter a site ICAO (or use ⊕ to browse) and click **+** to add it to your watch list
2. Optionally add multiple sites — click a site card to switch which one is displayed
3. Adjust **Rolling Window**, **Geometry Cache Depth**, and **Poll Interval** as needed
4. Click **START WATCHING** — the app immediately fetches the latest scans and then re-checks on the configured interval

While watching:
- New scans are downloaded automatically and loaded into the 3D view
- Old scans beyond the rolling window are deleted from disk (only scans downloaded by Current mode are auto-deleted — files you downloaded manually via FETCH are never touched)
- Click 💾 on a site card to pin all its scans and prevent auto-rotation
- The chip strip below the site list shows cached scans for the active site, color-coded the same way as the scan timeline

### Scan Timeline

The chip strip in the topbar shows the ±5 scans around the active scan (configurable with the ± buttons):

| Chip color | Meaning |
|------------|---------|
| **Cyan** | Currently displayed scan |
| **Green** | Geometry cached — loads instantly |
| **Amber** | Parse data cached — loads in ~1 s |
| **Gray-blue** | On disk only — fetches from server on click |

Click any chip to load that scan. The range picker (±3 / ±5 / ±10) controls how many chips are shown.

Pre-warming runs once when you first open a scan, caching ±2 neighbors. Navigating does not re-trigger pre-warming — green chips stay green and everything else loads on demand.

### Camera Controls

| Action | Control |
|--------|---------|
| Orbit | Left-drag |
| Zoom | Scroll or right-drag |
| Pan | Middle-drag |
| Reset to site | ⊙ button |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Step to previous / next scan |
| `1` – `6` | Switch moment (REF / VEL / SW / ZDR / PHI / RHO) |
| `R` | Reset camera to site |

---

## Adding Weather Events

Add entries to the `WEATHER_EVENTS` array in `client/js/data/events.js`:

```javascript
{
  id:          'joplin-tornado-2011',
  title:       'Joplin, MO EF5 Tornado',
  date:        '22 May 2011',
  type:        'tornado',
  description: 'Catastrophic EF5 tornado that struck Joplin, Missouri.',
  sites: [
    { icao: 'KSGF', label: 'Springfield', date: '2011-05-22', startUTC: '21:00', endUTC: '22:30' },
  ],
},
```

Event types: `tornado` | `severe` | `hurricane` | `winter`

---

## Data Source

NEXRAD Level II data via the [NOAA Open Data Program](https://www.noaa.gov/information-technology/open-data-dissemination):

- **Bucket**: `s3://unidata-nexrad-level2`
- **Coverage**: 160+ WSR-88D sites, 1991–present
- **License**: NOAA Open Data — free for any use

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Radar parsing | [nexrad-level-2-data](https://github.com/netbymatt/nexrad-level-2-data) |
| 3D globe | [Cesium.js 1.114](https://cesium.com) |
| Point cloud | [Three.js r128](https://threejs.org) |
| Client modules | Vanilla ES modules (no bundler) |

---

## License

MIT
