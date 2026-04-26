/**
 * current.js — "CURRENT" weather mode
 *
 * Manages site selection, rolling file downloads, geometry lifecycle,
 * and the live-update polling loop for the Current Weather tab.
 */

import { NEXRAD_SITES } from '../data/sites.js';
import { $, getSiteCoords, parseFileMeta, toast } from '../utils.js';
import { state, getCachedParsed, setCachedParsed, hasCachedParsed, clearParsedCache } from '../state.js';
import { API } from '../api.js';

// ── Module-level state ─────────────────────────────────────────────────────────

// { icao → { scans: [{key, localName}], saved: bool, downloading: bool } }
const _siteRegistry = new Map();

let _activeSiteIcao  = null;   // which site's geometry is currently displayed
let _pollingTimer    = null;   // setInterval handle
let _pollGeneration  = 0;      // incremented on stop, lets async ops self-cancel
let _prewarmGen      = 0;      // separate from app.js prewarm gen

// Settings (user-adjustable)
let _maxScans        = 5;      // rolling window depth
let _maxGeomScans    = 5;      // how many scans to keep geometry loaded
let _pollIntervalMs  = 120_000; // 2 minutes between checks

// Callbacks injected from app.js
let _onLoadScan      = null;   // (filename, icao) → loads scan into 3D view
let _onLocalFiles    = null;   // () → reloads local file list
let _onSitesChanged  = null;   // () → tells app.js to refresh site markers on the globe

// Track which files were downloaded by Current mode (so we don't delete user files)
const _currentModeFiles = new Set();

// ── Public init ───────────────────────────────────────────────────────────────

export function init({ onLoadScan, onLocalFiles, onSitesChanged }) {
  _onLoadScan     = onLoadScan;
  _onLocalFiles   = onLocalFiles;
  _onSitesChanged = onSitesChanged || null;
  _buildPanel();
}

// ── Panel construction ────────────────────────────────────────────────────────

function _buildPanel() {
  const panel = $('current-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="section-label">WATCHED SITES</div>
    <div class="current-add-row">
      <input type="text" id="current-site-input" placeholder="ICAO e.g. KGRB" maxlength="4">
      <button class="icon-btn" id="current-site-lookup-btn" title="Browse sites">⊕</button>
      <button class="icon-btn" id="current-site-add-btn" title="Add site">+</button>
    </div>
    <div id="current-site-list" class="current-site-list"></div>

    <div class="current-divider"></div>

    <div class="section-label">ACTIVE SCANS
      <span id="current-active-label" class="current-status-badge"></span>
    </div>
    <div id="current-scan-chips" class="current-scan-chips"></div>

    <div class="current-divider"></div>

    <div class="section-label">SETTINGS</div>
    <div class="form-group">
      <label>ROLLING WINDOW (files per site)</label>
      <div class="range-row">
        <input type="range" id="current-max-scans" min="2" max="20" step="1" value="5">
        <span id="current-max-scans-val" class="range-val">5</span>
      </div>
    </div>
    <div class="form-group">
      <label>GEOMETRY CACHE DEPTH</label>
      <div class="range-row">
        <input type="range" id="current-max-geom" min="1" max="10" step="1" value="5">
        <span id="current-max-geom-val" class="range-val">5</span>
      </div>
    </div>
    <div class="form-group">
      <label>POLL INTERVAL (seconds)</label>
      <div class="range-row">
        <input type="range" id="current-poll-interval" min="30" max="600" step="30" value="120">
        <span id="current-poll-interval-val" class="range-val">120s</span>
      </div>
    </div>

    <div class="current-controls-row">
      <button class="btn-primary" id="current-start-btn" style="flex:1">
        <span class="btn-icon">▶</span> START WATCHING
      </button>
      <button class="btn-primary" id="current-stop-btn" style="flex:1;display:none;border-color:var(--warn);color:var(--warn)">
        <span class="btn-icon">■</span> STOP
      </button>
    </div>
    <div id="current-status-row" class="current-status-row" style="display:none">
      <span class="current-live-dot"></span>
      <span id="current-status-text" class="current-status-text">Watching…</span>
    </div>
  `;

  // Input: upper-case only
  $('current-site-input').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });
  $('current-site-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _addSite($('current-site-input').value.trim());
  });

  $('current-site-add-btn').addEventListener('click', () => {
    _addSite($('current-site-input').value.trim());
  });

  // Re-use the existing site-modal but wire it to current input
  $('current-site-lookup-btn').addEventListener('click', () => {
    // Flag so site-modal close fills current-site-input
    window._currentModalTarget = true;
    $('site-modal').style.display = 'flex';
    $('site-search').focus();
  });

  $('current-max-scans').addEventListener('input', e => {
    _maxScans = parseInt(e.target.value);
    $('current-max-scans-val').textContent = _maxScans;
  });
  $('current-max-geom').addEventListener('input', e => {
    _maxGeomScans = parseInt(e.target.value);
    $('current-max-geom-val').textContent = _maxGeomScans;
  });
  $('current-poll-interval').addEventListener('input', e => {
    _pollIntervalMs = parseInt(e.target.value) * 1000;
    $('current-poll-interval-val').textContent = e.target.value + 's';
    // Restart polling with new interval if already running
    if (_pollingTimer) {
      clearInterval(_pollingTimer);
      _pollingTimer = setInterval(_pollAllSites, _pollIntervalMs);
    }
  });

  $('current-start-btn').addEventListener('click', startWatching);
  $('current-stop-btn').addEventListener('click', stopWatching);
}

// ── Site management ────────────────────────────────────────────────────────────

function _addSite(icao) {
  if (!icao || icao.length < 3) { toast('Enter a valid ICAO code', 'error'); return; }
  icao = icao.toUpperCase();
  if (_siteRegistry.has(icao)) { toast(`${icao} already in watch list`, 'error'); return; }

  const siteInfo = NEXRAD_SITES.find(s => s.icao === icao);
  if (!siteInfo) { toast(`Unknown site: ${icao}`, 'error'); return; }

  _siteRegistry.set(icao, { scans: [], saved: false, downloading: false });
  $('current-site-input').value = '';
  _renderSiteList();
  _onSitesChanged?.();
  toast(`Added ${icao} to watch list`, 'success');
}

function _removeSite(icao) {
  _siteRegistry.delete(icao);
  if (_activeSiteIcao === icao) {
    _activeSiteIcao = _siteRegistry.size > 0 ? [..._siteRegistry.keys()][0] : null;
    if (_activeSiteIcao) _switchDisplaySite(_activeSiteIcao);
  }
  _renderSiteList();
  _renderScanChips();
  _onSitesChanged?.();
}

function _renderSiteList() {
  const list = $('current-site-list');
  list.innerHTML = '';

  _siteRegistry.forEach((entry, icao) => {
    const siteInfo = NEXRAD_SITES.find(s => s.icao === icao);
    const card = document.createElement('div');
    card.className = 'current-site-card' + (icao === _activeSiteIcao ? ' active' : '');
    card.dataset.icao = icao;

    const scansAvail = entry.scans.length;
    const statusDot  = entry.downloading ? '⟳' : scansAvail > 0 ? '●' : '○';
    const dotClass   = entry.downloading ? 'downloading' : scansAvail > 0 ? 'ready' : 'idle';

    card.innerHTML = `
      <div class="current-site-info">
        <span class="current-site-dot ${dotClass}">${statusDot}</span>
        <div>
          <div class="current-site-icao">${icao}</div>
          <div class="current-site-name">${siteInfo ? siteInfo.name + ', ' + siteInfo.state : '—'}</div>
        </div>
      </div>
      <div class="current-site-actions">
        <span class="current-site-count">${scansAvail}/${_maxScans}</span>
        <button class="current-save-btn ${entry.saved ? 'active' : ''}" data-icao="${icao}" title="${entry.saved ? 'Unsave (allow deletion)' : 'Save (keep all scans)'}">
          ${entry.saved ? '🔒' : '💾'}
        </button>
        <button class="current-remove-btn" data-icao="${icao}" title="Remove site">✕</button>
      </div>`;

    // Click card body → switch display to this site
    card.addEventListener('click', e => {
      if (e.target.closest('.current-save-btn') || e.target.closest('.current-remove-btn')) return;
      _switchDisplaySite(icao);
    });

    card.querySelector('.current-save-btn').addEventListener('click', e => {
      e.stopPropagation();
      entry.saved = !entry.saved;
      _renderSiteList();
      toast(entry.saved ? `${icao} scans will be kept` : `${icao} scans will auto-rotate`, 'info');
    });

    card.querySelector('.current-remove-btn').addEventListener('click', e => {
      e.stopPropagation();
      _removeSite(icao);
    });

    list.appendChild(card);
  });

  if (_siteRegistry.size === 0) {
    list.innerHTML = '<div class="current-empty-sites">No sites added. Enter an ICAO code above.</div>';
  }
}

// ── Scan chip timeline for active site ────────────────────────────────────────

function _renderScanChips() {
  const chips   = $('current-scan-chips');
  const label   = $('current-active-label');
  chips.innerHTML = '';

  if (!_activeSiteIcao || !_siteRegistry.has(_activeSiteIcao)) {
    label.textContent = '';
    return;
  }

  const entry = _siteRegistry.get(_activeSiteIcao);
  label.textContent = _activeSiteIcao;

  if (entry.scans.length === 0) {
    chips.innerHTML = '<div class="current-chips-empty">Waiting for first scan…</div>';
    return;
  }

  // Most recent first
  const sorted = [...entry.scans].reverse();
  sorted.forEach((scan, i) => {
    const meta = parseFileMeta(scan.localName);
    const isActive = state.activeFile === scan.localName;
    const hasGeom  = window.Radar3D && window.Radar3D.hasCachedGeometry(scan.localName);
    const hasParse = hasCachedParsed(scan.localName);

    const chip = document.createElement('button');
    chip.className = 'current-chip';
    if (isActive)       chip.classList.add('active');
    else if (hasGeom)   chip.classList.add('status-geometry');
    else if (hasParse)  chip.classList.add('status-parsed');
    else                chip.classList.add('status-local');

    chip.title = meta.dateLabel + ' ' + meta.timeLabel;
    chip.innerHTML = `<span class="chip-time">${meta.scanLabel}</span>`;
    if (i === 0) chip.innerHTML += '<span class="chip-live">LIVE</span>';

    chip.addEventListener('click', () => {
      if (!isActive) _onLoadScan(scan.localName, _activeSiteIcao);
    });
    chips.appendChild(chip);
  });
}

// ── Site switching ────────────────────────────────────────────────────────────

async function _switchDisplaySite(icao) {
  if (_activeSiteIcao === icao) return;

  _activeSiteIcao = icao;
  _onSitesChanged?.();

  // Clear geometry for previous site — one site at a time
  ++_prewarmGen;
  if (window.Radar3D) {
    window.Radar3D.abortPrebuild();
    window.Radar3D.clearGeometryCache();
    clearParsedCache();
  }

  _renderSiteList();
  _renderScanChips();

  const entry = _siteRegistry.get(icao);
  if (!entry || entry.scans.length === 0) return;

  // Display most recent, then prewarm backwards
  const mostRecent = entry.scans[entry.scans.length - 1];
  await _onLoadScan(mostRecent.localName, icao);
  _prewarmCurrentSite(icao);
}

// ── Polling & download ────────────────────────────────────────────────────────

export async function startWatching() {
  if (_siteRegistry.size === 0) {
    toast('Add at least one site first', 'error');
    return;
  }

  const gen = ++_pollGeneration;

  $('current-start-btn').style.display  = 'none';
  $('current-stop-btn').style.display   = '';
  $('current-status-row').style.display = 'flex';
  _setStatusText('Starting…');

  // Initial fetch for all sites
  await _pollAllSites(gen);

  if (_pollGeneration !== gen) return;

  _pollingTimer = setInterval(() => _pollAllSites(_pollGeneration), _pollIntervalMs);
  _setStatusText('Watching — checking every ' + (_pollIntervalMs / 1000) + 's');
  _onSitesChanged?.();
}

export function stopWatching() {
  ++_pollGeneration;
  if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }

  $('current-start-btn').style.display  = '';
  $('current-stop-btn').style.display   = 'none';
  $('current-status-row').style.display = 'none';
  _onSitesChanged?.();
  toast('Stopped watching', 'info');
}

async function _pollAllSites(gen) {
  if (gen !== undefined && gen !== _pollGeneration) return;

  _setStatusText('Checking for new scans…');
  let anyNew = false;

  for (const icao of _siteRegistry.keys()) {
    if (gen !== _pollGeneration) return;
    try {
      const gotNew = await _fetchLatestForSite(icao);
      if (gotNew) anyNew = true;
    } catch (err) {
      console.warn(`[Current] Poll error for ${icao}:`, err.message);
    }
  }

  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  _setStatusText(`Last check: ${now} — watching every ${_pollIntervalMs / 1000}s`);

  if (anyNew) _renderScanChips();
}

/**
 * Fetch the last _maxScans for a site, starting from the most recent on S3.
 * Returns true if new files were downloaded.
 */
async function _fetchLatestForSite(icao) {
  const entry = _siteRegistry.get(icao);
  if (!entry || entry.downloading) return false;

  entry.downloading = true;
  _renderSiteList();

  try {
    // Get today's S3 listing (fall back to yesterday if today is empty)
    const keys = await _getRecentS3Keys(icao, _maxScans);
    if (!keys || keys.length === 0) return false;

    // keys is newest→oldest, take up to _maxScans
    const targetKeys = keys.slice(0, _maxScans);

    let downloadedAny = false;
    let firstFile = null;

    for (let i = 0; i < targetKeys.length; i++) {
      const key       = targetKeys[i];
      const localName = key.replace(/\//g, '_');

      // Already have it?
      if (entry.scans.some(s => s.localName === localName)) continue;
      if (state.localFiles.some(f => f.name === localName)) {
        // It's on disk but not in our registry — add it
        entry.scans.push({ key, localName });
        _currentModeFiles.add(localName);
        downloadedAny = true;
        if (!firstFile) firstFile = localName;
        continue;
      }

      // Download it
      try {
        _setStatusText(`Downloading ${icao} scan ${i + 1}/${targetKeys.length}…`);
        const res  = await fetch(`${API}/nexrad/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        entry.scans.push({ key, localName });
        _currentModeFiles.add(localName);
        downloadedAny = true;

        // Sort by timestamp (oldest first)
        _sortEntryScans(entry);

        // Refresh local file list
        if (_onLocalFiles) await _onLocalFiles();

        // Show immediately on first ready scan if this is the active site
        if (!firstFile) {
          firstFile = localName;
          if (!_activeSiteIcao) {
            _activeSiteIcao = icao;
            _renderSiteList();
          }
          if (icao === _activeSiteIcao && !state.activeFile) {
            await _onLoadScan(localName, icao);
          }
        }

        _renderScanChips();
        _renderSiteList();

      } catch (dlErr) {
        console.warn(`[Current] Download failed for ${key}:`, dlErr.message);
      }
    }

    // After all downloads, sort and trim if not saved
    _sortEntryScans(entry);
    if (!entry.saved) await _trimOldScans(icao, entry);

    // Prewarm geometry for active site
    if (icao === _activeSiteIcao && downloadedAny) {
      _prewarmCurrentSite(icao);
    }

    _renderSiteList();
    _renderScanChips();
    return downloadedAny;

  } finally {
    entry.downloading = false;
    _renderSiteList();
  }
}

function _sortEntryScans(entry) {
  entry.scans.sort((a, b) => {
    const ma = a.localName.match(/(\d{8}_\d{6})/);
    const mb = b.localName.match(/(\d{8}_\d{6})/);
    if (ma && mb) return ma[1].localeCompare(mb[1]);
    return a.localName.localeCompare(b.localName);
  });
}

/**
 * Delete oldest Current-mode-owned files beyond _maxScans.
 * Will NOT delete files downloaded by the user via FETCH/FILES.
 */
async function _trimOldScans(icao, entry) {
  while (entry.scans.length > _maxScans) {
    const oldest = entry.scans[0]; // oldest is at index 0
    // Only delete if Current mode owns this file
    if (_currentModeFiles.has(oldest.localName)) {
      try {
        const res = await fetch(`${API}/local-files/${encodeURIComponent(oldest.localName)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          _currentModeFiles.delete(oldest.localName);
          entry.scans.shift();
          console.log(`[Current] Trimmed old scan: ${oldest.localName}`);
        } else {
          break; // stop trimming on error
        }
      } catch (e) {
        console.warn('[Current] Trim error:', e.message);
        break;
      }
    } else {
      // This file is user-owned — can't delete, stop here
      entry.scans.shift(); // remove from our tracking but leave file on disk
    }
  }
  if (_onLocalFiles) await _onLocalFiles();
}

/**
 * Get the most recent _maxScans S3 keys for a site.
 * Checks today first, then yesterday if needed.
 */
async function _getRecentS3Keys(icao, count) {
  const keys = [];

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const year  = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(d.getUTCDate()).padStart(2, '0');

    try {
      const listRes = await fetch(
        `${API}/nexrad/list?site=${icao}&year=${year}&month=${month}&day=${day}`
      );
      const listData = await listRes.json();
      if (listData.error) continue;

      const proxyRes = await fetch(listData.proxyUrl);
      const files    = await proxyRes.json();
      if (!Array.isArray(files) || files.error) continue;

      // Sort newest first
      const sorted = files.sort((a, b) => b.localeCompare(a));
      keys.push(...sorted);

      if (keys.length >= count) break;
    } catch (e) {
      console.warn(`[Current] S3 list failed for ${icao} day-${dayOffset}:`, e.message);
    }
  }

  return keys.slice(0, count);
}

// ── Geometry pre-warming for current site ─────────────────────────────────────

async function _prewarmCurrentSite(icao) {
  const myGen = ++_prewarmGen;
  const entry = _siteRegistry.get(icao);
  if (!entry || entry.scans.length === 0) return;

  const coords  = getSiteCoords(icao);
  const scans   = [...entry.scans].reverse(); // newest first
  const toWarm  = scans.slice(0, _maxGeomScans);

  for (const scan of toWarm) {
    if (_prewarmGen !== myGen) return;

    if (window.Radar3D && window.Radar3D.hasCachedGeometry(scan.localName)) continue;

    try {
      let data = getCachedParsed(scan.localName);
      if (!data) {
        const res = await fetch(`${API}/radar/parse?file=${encodeURIComponent(scan.localName)}`);
        if (!res.ok) continue;
        data = await res.json();
        if (data.error) continue;
        setCachedParsed(scan.localName, data);
      }

      if (_prewarmGen !== myGen) return;
      if (window.Radar3D) {
        await window.Radar3D.prebuildScans(
          [{ filename: scan.localName, data, siteLat: coords.lat, siteLon: coords.lon }],
          () => { if (_prewarmGen === myGen) _renderScanChips(); }
        );
      }
    } catch (e) { /* best-effort */ }
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function _setStatusText(msg) {
  const el = $('current-status-text');
  if (el) el.textContent = msg;
}

// ── Hook for app.js to call when site-modal closes ────────────────────────────
// The site modal normally fills #site-input; we intercept for current mode.

export function onSiteModalSelect(icao) {
  if (window._currentModalTarget) {
    window._currentModalTarget = false;
    $('current-site-input').value = icao;
  }
}

// ── Exported helpers for app.js ───────────────────────────────────────────────

export function isCurrentModeFile(filename) {
  return _currentModeFiles.has(filename);
}

export function getCurrentActiveSite() {
  return _activeSiteIcao;
}

// Called by app.js when a scan finishes loading, so we can refresh chips
export function onScanLoaded(filename) {
  _renderScanChips();
  _renderSiteList();
}

// Returns all watched sites as [{ icao, lat, lon }] for globe marker placement
export function getWatchedSites() {
  return [..._siteRegistry.keys()].map(icao => {
    const coords = getSiteCoords(icao);
    return { icao, lat: coords.lat, lon: coords.lon };
  });
}

// Switches the displayed site — used by app.js when a map marker is clicked
export function switchToSite(icao) {
  _switchDisplaySite(icao);
}