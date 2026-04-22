# ◈ NEXRAD 3D

A high-performance 3D radar visualization tool for NEXRAD WSR-88D Level II data. Explore storm structure in full 3D on a live satellite globe, with support for all dual-polarization moments, elevation angle selection, and direct access to NOAA's public radar archive.

----

## Features

- **3D globe rendering** — Cesium.js globe with satellite, street, terrain, and dark map styles
- **Full dual-pol support** — REF, VEL, SW, ZDR, PHI, RHO with NWS-standard colormaps
- **NOAA archive access** — Browse and download any scan from the public `unidata-nexrad-level2` S3 bucket (1991–present)
- **Smart elevation selector** — Cuts grouped by angle, multi-select, sorted lowest to highest
- **Moment info panel** — Plain-English descriptions and context-aware filters per product
- **Notable events** — One-click download of pre-defined weather events
- **Scan navigation** — Step forward/backward through cached scans with prev/next buttons
- **Session persistence** — Elevation, moment, and filter settings carry over between scans
- **Memory efficient** — Hybrid Three.js + Cesium renderer handles large volume scans

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
node server/index.js

# 5. Open http://localhost:3000
```

> **Windows:** Use `node server\index.js` or run `start.sh` in Git Bash.

---

## Project Structure

```
nexrad3d/
├── server/
│   ├── index.js          # Express API — serves client, proxies NOAA S3, parses radar
│   └── package.json
├── client/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js        # UI controller and state management
│       ├── radar3d.js    # Cesium + Three.js hybrid renderer
│       └── colormaps.js  # NWS-standard color tables
├── data/                 # Cached radar files (git-ignored, auto-created)
├── .gitignore
├── start.sh
└── README.md
```

---

## Configuration

### Cesium Token

Get a free token at [cesium.com/ion/signup](https://cesium.com/ion/signup) (free tier is plenty).

```bash
# Copy the template
cp config.template.json config.json

# Edit config.json and paste your token
{
  "cesiumToken": "your_token_here"
}
```

`config.json` is git-ignored so your token is never committed. Alternatively, set the `CESIUM_TOKEN` environment variable:

```bash
CESIUM_TOKEN=your_token node server/index.js
```

### Port

Defaults to `3000`. Override with:

```bash
PORT=8080 node server/index.js
```

---

## Usage

### Fetching Data

1. **FETCH tab** → enter a site ICAO + date, or pick a Notable Event
2. Click **LIST AVAILABLE FILES** to browse the NOAA archive
3. Click **↓ GET** to download a scan to your local cache

### Viewing

1. **FILES tab** → scans organized by site and date → click **LOAD**
2. **DISPLAY tab** → switch moments, select elevation angles, adjust rendering
3. Use **‹ ›** buttons in the topbar to step between scans chronologically

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
| `1–6` | Switch moment (REF/VEL/SW/ZDR/PHI/RHO) |
| `R` | Reset camera |

---

## Adding Weather Events

Add entries to the `WEATHER_EVENTS` array in `client/js/app.js`:

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

Types: `tornado` | `severe` | `hurricane` | `winter`

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

---

## License

MIT