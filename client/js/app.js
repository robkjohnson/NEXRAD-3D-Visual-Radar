/**
 * app.js — Application orchestrator
 * Initializes modules, handles data loading, and wires up event listeners.
 */
import { NEXRAD_SITES } from './data/sites.js';
import { state, getCachedParsed, setCachedParsed, clearParsedCache, hasCachedParsed } from './state.js';
import { $, extractIcaoFromFilename, getSiteCoords, parseFileMeta,
         toast, setLoading, switchTab, updatePointCount } from './utils.js';
import { API } from './api.js';
import { buildMomentButtons, updateMomentButtons, updateColorbar,
         updateMomentInfoPanel, MOMENT_INFO } from './ui/moment-panel.js';
import { buildElevationList } from './ui/elevation.js';
import { init as initFilesPanel, renderLocalFiles } from './ui/files.js';
import { init as initS3Panel, renderS3FileList } from './ui/s3.js';
import { init as initEventsPanel, buildEventsList, buildEventFilterChips,
         getEventFileNames } from './ui/events.js';
import { init as initCurrentPanel, onSiteModalSelect, onScanLoaded as currentOnScanLoaded,
         getWatchedSites, switchToSite } from './ui/current.js';

// ── Initialization ────────────────────────────────────────────────────────────

function init() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  $('date-input').value = d.toISOString().slice(0, 10);

  window.Radar3D.init('cesium-container');

  // Wire cross-module dependencies
  initFilesPanel({ onLoad: loadRadarFile, getEventFileNames });
  initS3Panel({ onLoad: loadRadarFile, onFileDownloaded: loadLocalFiles });
  initEventsPanel({ onDownloadComplete: loadLocalFiles });
  initCurrentPanel({ onLoadScan: loadRadarFile, onLocalFiles: loadLocalFiles, onSitesChanged: refreshSiteMarkers });

  buildMomentButtons();
  buildSiteGrid();
  buildEventsList();
  buildEventFilterChips();
  setupEventListeners();
  loadLocalFiles();

  const panel = $('moment-info-panel');
  if (panel) {
    panel.classList.remove('collapsed');
    try {
      updateMomentInfoPanel('reflectivity');
    } catch(e) {
      console.error('[Panel] Init render failed:', e);
    }
  } else {
    console.error('[Panel] moment-info-panel element not found in DOM');
  }

  const tc = document.createElement('div');
  tc.id = 'toast-container';
  document.body.appendChild(tc);
}

// ── Data loading ──────────────────────────────────────────────────────────────

// Incremented whenever a new scan load starts. Lets in-flight prewarms detect
// that the user has moved on and self-cancel.
let _prewarmGeneration = 0;
let _scanNavRange = 5;

async function loadRadarFile(filename, siteIcao, { prewarm = true } = {}) {
  setLoading(true, `Loading ${filename}...`);
  try {
    // Resolve the ICAO early so we can detect a site change before fetching
    const earlyIcao = siteIcao || extractIcaoFromFilename(filename);
    const siteChanged = state.activeSite && state.activeSite.icao !== earlyIcao;

    if (siteChanged) {
      // Stop any in-flight prewarm and dispose the old site's cached geometry
      ++_prewarmGeneration;
      window.Radar3D.abortPrebuild();
      window.Radar3D.clearGeometryCache();
      clearParsedCache();
      console.log('[App] Site changed → caches cleared');
    }

    let data = getCachedParsed(filename);
    if (!data) {
      // Geometry cache stores parse data alongside meshes — use it to skip server fetch
      data = window.Radar3D.getCachedParseData(filename);
      if (data) {
        setCachedParsed(filename, data);
      } else {
        const res = await fetch(`${API}/radar/parse?file=${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        data = await res.json();
        if (data.error) throw new Error(data.error);
        setCachedParsed(filename, data);
      }
    }

    state.radarData  = data;
    state.activeFile = filename;

    const icao = (data.header?.icao && data.header.icao !== 'UNKN')
      ? data.header.icao
      : earlyIcao;
    const coords = getSiteCoords(icao);
    state.activeSite = { icao, ...coords };

    state.availableMoments = new Set();
    data.elevations.forEach(e => Object.keys(e.data).forEach(k => state.availableMoments.add(k)));

    window.Radar3D.loadRadarData(data, coords.lat, coords.lon, filename);

    updateMomentButtons();
    buildElevationList();
    updatePointCount();
    renderLocalFiles(state.localFiles);

    $('radar-id-display').textContent = icao.toUpperCase();
    $('radar-time-display').textContent = formatScanTime(data.header, filename);

    buildScanList(filename, icao);
    if (prewarm) prewarmAdjacentScans(icao);

    $('empty-state').classList.add('hidden');
    switchTab('display');

    currentOnScanLoaded(filename);
    refreshSiteMarkers();

    const activeMoment = state.availableMoments.has(window.Radar3D.currentMoment)
      ? window.Radar3D.currentMoment
      : [...state.availableMoments][0] || 'reflectivity';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          updateColorbar(activeMoment);
        } catch(e) {
          console.error('[Panel] updateColorbar failed:', e);
        }
      });
    });

    toast(`Loaded: ${data.elevations.length} tilts, ${state.availableMoments.size} moments`, 'success');
  } catch (err) {
    toast('Parse error: ' + err.message, 'error');
    console.error(err);
  } finally { setLoading(false); }
}

function formatScanTime(header, filename) {
  if (header?.scan_date && header?.scan_time) {
    try {
      const epoch = (header.scan_date - 1) * 86400 * 1000 + header.scan_time;
      const d = new Date(epoch);
      const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const pad = n => String(n).padStart(2, '0');
      return `${days[d.getUTCDay()]} ${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}  ` +
             `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
    } catch (_) { return filename; }
  }
  const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${m[3]} ${months[parseInt(m[2])-1]} ${m[1]}  ${m[4]}:${m[5]}:${m[6]} UTC`;
  }
  return filename;
}

async function loadLocalFiles() {
  try {
    const res = await fetch(`${API}/local-files`);
    const files = await res.json();
    state.localFiles = files;
    renderLocalFiles(files);
    if (state.activeFile && state.activeSite) {
      buildScanList(state.activeFile, state.activeSite.icao);
    }
  } catch (err) { console.warn('Could not load local files:', err); }
}

async function listS3Files() {
  const site    = $('site-input').value.trim().toUpperCase();
  const dateStr = $('date-input').value;
  if (!site || !dateStr) { toast('Enter a site and date', 'error'); return; }
  const [year, month, day] = dateStr.split('-');
  const btn = $('list-btn');
  btn.disabled = true;
  setLoading(true, `Querying NEXRAD archive for ${site}...`);
  try {
    const res = await fetch(`${API}/nexrad/list?site=${site}&year=${year}&month=${month}&day=${day}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const filesRes = await fetch(data.proxyUrl);
    const files    = await filesRes.json();
    if (files.error) throw new Error(files.error);
    state.s3Files = files;
    renderS3FileList(files, site);
    toast(`Found ${files.length} scans for ${site}`, 'success');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    $('file-list-container').style.display = 'none';
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('radarFile', file);
  setLoading(true, `Uploading ${file.name}...`);
  try {
    const res  = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    toast(`Uploaded: ${data.file}`, 'success');
    loadLocalFiles();
    loadRadarFile(data.file, data.file.slice(0, 4));
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
  } finally { setLoading(false); }
}

// ── Scan navigation ───────────────────────────────────────────────────────────

function buildScanList(activeFilename, siteIcao) {
  const siteFiles = state.localFiles
    .filter(f => extractIcaoFromFilename(f.name) === siteIcao.toUpperCase())
    .sort((a, b) => {
      const ma = a.name.match(/(\d{8}_\d{6})/);
      const mb = b.name.match(/(\d{8}_\d{6})/);
      if (ma && mb) return ma[1].localeCompare(mb[1]);
      return a.name.localeCompare(b.name);
    });

  state.siteScans  = siteFiles;
  state.scanIndex  = siteFiles.findIndex(f => f.name === activeFilename);
  updateScanNav();
}

function updateScanNav() {
  const nav    = $('scan-nav');
  const scans  = state.siteScans;
  const idx    = state.scanIndex;

  if (!scans.length || idx < 0) { nav.style.display = 'none'; return; }

  nav.style.display = 'flex';
  $('scan-nav-pos').textContent = `${idx + 1} / ${scans.length}`;
  $('scan-prev-btn').disabled = idx <= 0;
  $('scan-next-btn').disabled = idx >= scans.length - 1;

  const timeline = $('scan-timeline');
  timeline.innerHTML = '';

  const start = Math.max(0, idx - _scanNavRange);
  const end   = Math.min(scans.length - 1, idx + _scanNavRange);

  for (let i = start; i <= end; i++) {
    const file = scans[i];
    const meta = parseFileMeta(file.name);
    const chip = document.createElement('button');
    chip.className = 'scan-chip';
    chip.title = `${meta.dateLabel} ${meta.timeLabel}`;
    chip.textContent = meta.scanLabel;

    if (i === idx) {
      chip.classList.add('active');
    } else {
      const hasGeom   = window.Radar3D.hasCachedGeometry(file.name);
      const hasParsed = hasCachedParsed(file.name);
      if (hasGeom)        chip.classList.add('status-geometry');
      else if (hasParsed) chip.classList.add('status-parsed');
      else                chip.classList.add('status-local');
      chip.addEventListener('click', () => loadRadarFile(file.name, extractIcaoFromFilename(file.name), { prewarm: false }));
    }

    timeline.appendChild(chip);
  }

  // Scroll active chip into view
  const activeChip = timeline.querySelector('.scan-chip.active');
  if (activeChip) {
    activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function navigateScan(direction) {
  const newIdx = state.scanIndex + direction;
  if (newIdx < 0 || newIdx >= state.siteScans.length) return;
  const file = state.siteScans[newIdx];
  loadRadarFile(file.name, extractIcaoFromFilename(file.name), { prewarm: false });
}

async function prewarmAdjacentScans(siteIcao) {
  const myGeneration = ++_prewarmGeneration;
  const scans = state.siteScans;
  const idx   = state.scanIndex;
  if (!scans.length || idx < 0) return;

  const fetchRange = Math.min(_scanNavRange, 2);
  const coords     = getSiteCoords(siteIcao);
  const prebuildList = [];

  // Only send server prewarm for files with nothing cached on the client.
  // Files already in the geometry cache are fully ready; files in the parse cache
  // only need geometry built client-side — no server round-trip needed for either.
  const serverFiles = [];
  for (let offset = -fetchRange; offset <= fetchRange; offset++) {
    if (offset === 0) continue;
    const i = idx + offset;
    if (i < 0 || i >= scans.length) continue;
    const name = scans[i].name;
    if (!hasCachedParsed(name) && !window.Radar3D.hasCachedGeometry(name)) {
      serverFiles.push(name);
    }
  }
  if (serverFiles.length) {
    fetch(`${API}/radar/prewarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: serverFiles }),
    }).catch(() => {});
  }

  for (let offset = -fetchRange; offset <= fetchRange; offset++) {
    if (offset === 0) continue;
    const i = idx + offset;
    if (i < 0 || i >= scans.length) continue;
    const adjFile = scans[i].name;

    if (_prewarmGeneration !== myGeneration) {
      console.log('[App] Prewarm cancelled — site changed');
      return;
    }

    // Geometry cached → fully ready, nothing to do for this file
    if (window.Radar3D.hasCachedGeometry(adjFile)) continue;

    try {
      let data = getCachedParsed(adjFile);
      if (!data) {
        const res = await fetch(`${API}/radar/parse?file=${encodeURIComponent(adjFile)}`);
        if (!res.ok) continue;
        data = await res.json();
        if (data.error) continue;
        setCachedParsed(adjFile, data);
        if (_prewarmGeneration === myGeneration) updateScanNav(); // chip → amber
      }
      prebuildList.push({ filename: adjFile, data, siteLat: coords.lat, siteLon: coords.lon });
    } catch (e) { /* silent — prebuild is best-effort */ }
  }

  if (_prewarmGeneration !== myGeneration) return;

  if (prebuildList.length) {
    console.log('[App] Pre-building geometry for', prebuildList.length, 'adjacent scans');
    await window.Radar3D.prebuildScans(prebuildList, () => {
      if (_prewarmGeneration === myGeneration) updateScanNav(); // chip → green
    });
  }
}

// ── UI builders ───────────────────────────────────────────────────────────────

function buildSiteGrid(filter = '') {
  const grid = $('site-grid');
  grid.innerHTML = '';
  const lf    = filter.toLowerCase();
  const sites = filter
    ? NEXRAD_SITES.filter(s =>
        s.icao.toLowerCase().includes(lf) ||
        s.name.toLowerCase().includes(lf) ||
        s.state.toLowerCase().includes(lf))
    : NEXRAD_SITES;
  sites.forEach(s => {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.innerHTML = `<div class="site-icao">${s.icao}</div><div class="site-state">${s.state} — ${s.name}</div>`;
    card.addEventListener('click', () => {
      // If the Current panel is waiting for a site selection, fill that input
      if (window._currentModalTarget) {
        onSiteModalSelect(s.icao);
      } else {
        $('site-input').value = s.icao;
      }
      $('site-modal').style.display = 'none';
    });
    grid.appendChild(card);
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  $('list-btn').addEventListener('click', listS3Files);
  $('site-input').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  $('site-input').addEventListener('keydown', e => { if (e.key === 'Enter') listS3Files(); });

  $('site-lookup-btn').addEventListener('click', () => {
    window._currentModalTarget = false;
    $('site-modal').style.display = 'flex'; $('site-search').focus();
  });
  $('site-search').addEventListener('input', e => buildSiteGrid(e.target.value));
  document.querySelector('.modal-close').addEventListener('click', () => {
    window._currentModalTarget = false;
    $('site-modal').style.display = 'none';
  });
  document.querySelector('.modal-backdrop').addEventListener('click', () => {
    window._currentModalTarget = false;
    $('site-modal').style.display = 'none';
  });

  $('moment-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.moment-btn');
    if (!btn || btn.disabled) return;
    const key = btn.dataset.moment;

    if (key === window.Radar3D.currentMoment) {
      // Clicking the active moment deselects it — clears the point cloud
      window.Radar3D.setMoment(null);
      updateMomentButtons();
      buildElevationList();
      updatePointCount();
      return;
    }

    const info = MOMENT_INFO[key];
    if (info) {
      if (info.filterType === 'min')               window.Radar3D.setThreshold(info.filterDefault);
      if (info.filterType === 'exclude_near_zero') window.Radar3D.setVelocityFilter(0);
      if (info.filterType === 'range')             window.Radar3D.setRangeFilter(info.filterMin, info.filterMax);
    }
    window.Radar3D.setMoment(key);
    updateMomentButtons();
    updateColorbar(key);
    buildElevationList();
    updatePointCount();
  });

  const infoPanel  = $('moment-info-panel');
  const infoToggle = $('moment-info-toggle');
  if (infoToggle) {
    infoToggle.addEventListener('click', () => infoPanel.classList.toggle('collapsed'));
  }

  document.querySelectorAll('.map-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.Radar3D.setMapStyle(btn.dataset.style);
    });
  });

  $('point-size').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('point-size-val').textContent = v;
    window.Radar3D.setPointSize(v);
  });
  $('opacity-range').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('opacity-val').textContent = v.toFixed(2);
    window.Radar3D.setOpacity(v);
  });
  $('height-scale').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('height-scale-val').textContent = v.toFixed(1);
    window.Radar3D.setHeightScale(v);
    updatePointCount();
  });
  $('show-rings').addEventListener('change', e => window.Radar3D.setShowRings(e.target.checked));
  $('show-site-labels').addEventListener('change', e => window.Radar3D.setSiteLabelsVisible(e.target.checked));
  $('animate-tilts').addEventListener('change', e => {
    window.Radar3D.setShowAllElevations(e.target.checked);
    buildElevationList();
    updatePointCount();
  });

  $('reset-camera-btn').addEventListener('click', () => window.Radar3D.resetCamera());
  $('scan-prev-btn').addEventListener('click', () => navigateScan(-1));
  $('scan-next-btn').addEventListener('click', () => navigateScan(+1));

  document.querySelectorAll('.scan-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scan-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _scanNavRange = parseInt(btn.dataset.range);
      updateScanNav();
    });
  });
  $('toggle-sidebar-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  const uploadZone  = $('upload-zone');
  const uploadInput = $('upload-input');
  uploadZone.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', e => { if (e.target.files[0]) uploadFile(e.target.files[0]); });
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });

  // File deletion dispatches this event so we can refresh without a direct dependency
  document.addEventListener('local-files-changed', loadLocalFiles);

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateScan(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigateScan(+1); return; }
    if (e.key === 'r' || e.key === 'R') window.Radar3D.resetCamera();
    if (e.key >= '1' && e.key <= '6') {
      const btns = document.querySelectorAll('.moment-btn');
      const idx  = parseInt(e.key) - 1;
      if (btns[idx] && !btns[idx].disabled) btns[idx].click();
    }
  });
}

// ── Site markers ─────────────────────────────────────────────────────────────

function refreshSiteMarkers() {
  const watched = getWatchedSites();
  if (watched.length > 0) {
    // Current mode is active — show all watched sites, highlight the displayed one
    window.Radar3D.setSiteMarkers(watched, state.activeSite?.icao ?? null, _handleSiteMarkerClick);
  } else if (state.activeSite) {
    // No Current mode — just mark the single active site
    window.Radar3D.setSiteMarkers(
      [{ icao: state.activeSite.icao, lat: state.activeSite.lat, lon: state.activeSite.lon }],
      state.activeSite.icao,
      _handleSiteMarkerClick
    );
  } else {
    window.Radar3D.setSiteMarkers([], null, null);
  }
}

function _handleSiteMarkerClick(icao) {
  const watched = getWatchedSites();
  if (watched.some(s => s.icao === icao)) {
    switchToSite(icao);
  } else {
    // Only marker is the active site — clicking it re-centers the camera
    window.Radar3D.resetCamera();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

init();