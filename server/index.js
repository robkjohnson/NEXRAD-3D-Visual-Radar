const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Level2Radar } = require('nexrad-level-2-data');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '../data');

// Load config (token lives here, never committed to git)
const CONFIG_PATH = path.join(__dirname, '../config.json');
let config = { cesiumToken: process.env.CESIUM_TOKEN || '' };
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  console.log(' Config loaded from config.json');
} catch (e) {
  if (process.env.CESIUM_TOKEN) {
    console.log(' Config loaded from CESIUM_TOKEN env var');
  } else {
    console.warn(' Warning: No config.json found and no CESIUM_TOKEN env var set.');
    console.warn(' Copy config.template.json to config.json and add your Cesium token.');
  }
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory parse cache — avoids re-parsing the same file on every request.
// Parsed Level 2 radar objects are 200–500 MB each in V8 heap, so keep this small.
const MAX_CACHED_SCANS = 4;
const parseCache = new Map(); // filename -> { data, timestamp }

function getCached(filename) {
  const entry = parseCache.get(filename);
  if (entry) {
    entry.timestamp = Date.now();
    return entry.data;
  }
  return null;
}

function setCached(filename, data) {
  if (parseCache.size >= MAX_CACHED_SCANS) {
    let oldest = null, oldestTime = Infinity;
    parseCache.forEach((v, k) => { if (v.timestamp < oldestTime) { oldest = k; oldestTime = v.timestamp; } });
    if (oldest) parseCache.delete(oldest);
  }
  parseCache.set(filename, { data, timestamp: Date.now() });
}

// Serializes parses so only one Level2Radar object is in memory at a time.
// Without this, concurrent prewarm + manual load can double peak heap usage.
let _parseLock = false;
async function parseWithLock(filePath) {
  while (_parseLock) await new Promise(r => setTimeout(r, 50));
  _parseLock = true;
  try {
    return parseRadarFile(filePath);
  } finally {
    _parseLock = false;
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const storage = multer.diskStorage({
  destination: DATA_DIR,
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Updated bucket name - noaa-nexrad-level2 was deprecated Sept 1 2025
const NEXRAD_BUCKET = 'unidata-nexrad-level2';
const NEXRAD_BASE = 'https://' + NEXRAD_BUCKET + '.s3.amazonaws.com';

async function downloadNexradFile(s3Key) {
  const localName = s3Key.replace(/\//g, '_');
  const localPath = path.join(DATA_DIR, localName);
  if (fs.existsSync(localPath)) {
    console.log('Already cached: ' + localName);
    return localPath;
  }
  const url = NEXRAD_BASE + '/' + s3Key;
  console.log('Downloading: ' + url);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  fs.writeFileSync(localPath, Buffer.from(res.data));
  console.log('Saved: ' + localName);
  return localPath;
}

function parseRadarFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const radar = new Level2Radar(buffer, { logger: false });
  const elevations = radar.listElevations();
  const result = {
    header: {
      icao: radar.header && radar.header.icao ? radar.header.icao : 'UNKN',
      scan_date: radar.header ? radar.header.scan_date : null,
      scan_time: radar.header ? radar.header.scan_time : null,
    },
    vcp: radar.vcp && radar.vcp.record ? radar.vcp.record.pattern_type : null,
    elevations: [],
  };

  for (const elev of elevations) {
    radar.setElevation(elev);
    const numScans = radar.getScans();
    if (!numScans) continue;
    const elevData = { elevation: elev, scans: numScans, data: {} };
    const moments = [
      { key: 'reflectivity', fn: () => radar.getHighresReflectivity() },
      { key: 'velocity',     fn: () => radar.getHighresVelocity() },
      { key: 'spectrum',     fn: () => radar.getHighresSpectrum() },
      { key: 'zdr',          fn: () => radar.getHighresDiffReflectivity() },
      { key: 'phi',          fn: () => radar.getHighresDiffPhase() },
      { key: 'rho',          fn: () => radar.getHighresCorrelationCoefficient() },
    ];
    for (const m of moments) {
      try {
        const raw = m.fn();
        if (raw && raw.length > 0 && raw[0]) elevData.data[m.key] = raw;
      } catch (_) {}
    }
    try { elevData.azimuths = radar.getAzimuth(); } catch (_) {}
    try {
      const headers = radar.getHeader();
      if (headers && headers[0]) elevData.elevationAngle = headers[0].elevation_angle;
    } catch (_) {}
    if (Object.keys(elevData.data).length > 0) result.elevations.push(elevData);
  }
  return result;
}

app.get('/api/config', (_req, res) => {
  res.json({ cesiumToken: config.cesiumToken || '' });
});

app.get('/api/local-files', (_req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(DATA_DIR, f)).size,
        modified: fs.statSync(path.join(DATA_DIR, f)).mtime,
      }))
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return proxy URL for client to call
app.get('/api/nexrad/list', (req, res) => {
  const { site, year, month, day } = req.query;
  if (!site || !year || !month || !day) {
    return res.status(400).json({ error: 'site, year, month, day required' });
  }
  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');
  const prefix = year + '/' + mm + '/' + dd + '/' + site.toUpperCase() + '/';
  res.json({ proxyUrl: '/api/nexrad/proxy?prefix=' + encodeURIComponent(prefix) });
});

// Proxy S3 listing through server to avoid CORS/403
app.get('/api/nexrad/proxy', async (req, res) => {
  const { prefix } = req.query;
  if (!prefix) return res.status(400).json({ error: 'prefix required' });

  // Try new bucket first, fall back to old bucket
  const urls = [
    'https://' + NEXRAD_BUCKET + '.s3.amazonaws.com/?prefix=' + prefix,
    'https://noaa-nexrad-level2.s3.amazonaws.com/?prefix=' + prefix,
  ];

  for (const url of urls) {
    try {
      console.log('Trying: ' + url);
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/xml, text/xml, */*',
        }
      });
      const matches = [...response.data.matchAll(/<Key>(.*?)<\/Key>/g)];
      const files = matches.map(m => m[1]).filter(k => !k.endsWith('_MDM'));
      console.log('Found ' + files.length + ' files from ' + url);
      return res.json(files);
    } catch (err) {
      console.error('Failed ' + url + ': ' + err.message);
    }
  }

  res.status(500).json({ error: 'Could not reach NEXRAD archive. Both S3 buckets returned errors.' });
});

// Download a file from S3
app.post('/api/nexrad/download', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const localPath = await downloadNexradFile(key);
    const localName = path.basename(localPath);
    res.json({ success: true, file: localName, size: fs.statSync(localPath).size });
  } catch (err) {
    // Try old bucket if new one fails
    try {
      const url = 'https://noaa-nexrad-level2.s3.amazonaws.com/' + key;
      console.log('Fallback download: ' + url);
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const localName = key.replace(/\//g, '_');
      const localPath = path.join(DATA_DIR, localName);
      fs.writeFileSync(localPath, Buffer.from(r.data));
      res.json({ success: true, file: localName, size: fs.statSync(localPath).size });
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// Parse a cached radar file (with in-memory cache)
app.get('/api/radar/parse', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file required' });
  const filename = path.basename(file);
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  try {
    const cached = getCached(filename);
    if (cached) {
      console.log('Cache hit: ' + filename);
      return res.json(cached);
    }
    console.log('Parsing: ' + filename);
    const data = await parseWithLock(filePath);
    setCached(filename, data);
    res.json(data);
  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pre-warm cache for a list of files (called by client to pre-load adjacent scans)
app.post('/api/radar/prewarm', (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'files array required' });

  // Only prewarm cache-miss files, cap at 2 to bound peak heap pressure
  const toWarm = files
    .map(f => path.basename(f))
    .filter(f => !getCached(f) && fs.existsSync(path.join(DATA_DIR, f)))
    .slice(0, 2);

  res.json({ queued: toWarm.length });

  (async () => {
    for (const filename of toWarm) {
      try {
        console.log('Pre-warming: ' + filename);
        const data = await parseWithLock(path.join(DATA_DIR, filename));
        setCached(filename, data);
      } catch (e) { console.warn('Prewarm failed for ' + filename + ':', e.message); }
    }
    if (toWarm.length) console.log('Pre-warm complete for ' + toWarm.length + ' files');
  })();
});

// Upload a local radar file
app.post('/api/upload', upload.single('radarFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, file: req.file.filename, size: req.file.size });
});

// Delete a cached file
app.delete('/api/local-files/:filename', (req, res) => {
  const filePath = path.join(DATA_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log('\n NEXRAD 3D Radar Server running at http://localhost:' + PORT);
  console.log(' Bucket: ' + NEXRAD_BUCKET);
  console.log(' Data directory: ' + DATA_DIR + '\n');
});