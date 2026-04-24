import { WEATHER_EVENTS } from '../data/events.js';
import { $, toast, switchTab } from '../utils.js';
import { state } from '../state.js';
import { API } from '../api.js';
import { renderLocalFiles } from './files.js';

// Injected by app.js during init
let _onDownloadComplete = null;

export function init({ onDownloadComplete }) {
  _onDownloadComplete = onDownloadComplete;
}

export function buildEventsList() {
  const container = $('events-list');
  container.innerHTML = '';

  WEATHER_EVENTS.forEach(event => {
    const card = document.createElement('div');
    card.className = 'event-card';

    card.innerHTML = `
      <div class="event-card-header">
        <div class="event-card-title">${event.title}</div>
        <div class="event-card-meta">
          <span class="event-tag ${event.type}">${event.type.toUpperCase()}</span>
          <span class="event-date-tag">${event.date}</span>
        </div>
      </div>
      <div class="event-card-body" id="event-body-${event.id}">
        <div class="event-description">${event.description}</div>
        <div class="event-sites" id="event-sites-${event.id}"></div>
        <button class="event-download-btn" id="event-btn-${event.id}">
          ↓ DOWNLOAD ALL SCANS
        </button>
      </div>`;

    card.querySelector('.event-card-header').addEventListener('click', () => {
      const body  = $(`event-body-${event.id}`);
      const isOpen = body.classList.contains('open');
      document.querySelectorAll('.event-card-body').forEach(b => b.classList.remove('open'));
      if (!isOpen) {
        body.classList.add('open');
        refreshEventSiteStatuses(event);
      }
    });

    card.querySelector(`#event-btn-${event.id}`).addEventListener('click', async e => {
      e.stopPropagation();
      await downloadEventScans(event);
    });

    container.appendChild(card);
  });
}

export function buildEventFilterChips() {
  const chipsContainer = $('event-filter-chips');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = '';

  WEATHER_EVENTS.forEach(event => {
    const chip = document.createElement('button');
    chip.className = `filter-chip event-chip ${event.type}`;
    chip.dataset.filter = event.id;
    chip.textContent = event.title;
    chip.title = event.date;
    chip.addEventListener('click', () => {
      state.activeFilter = event.id;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderLocalFiles(state.localFiles);
    });
    chipsContainer.appendChild(chip);
  });

  const allChip = document.querySelector('.filter-chip[data-filter="all"]');
  if (allChip) {
    allChip.addEventListener('click', () => {
      state.activeFilter = 'all';
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      allChip.classList.add('active');
      renderLocalFiles(state.localFiles);
    });
  }
}

// Returns the set of local filenames that belong to a given event
export function getEventFileNames(eventId) {
  const event = WEATHER_EVENTS.find(e => e.id === eventId);
  if (!event) return new Set();

  const names = new Set();
  event.sites.forEach(site => {
    const [startH, startM] = site.startUTC.split(':').map(Number);
    const [endH,   endM  ] = site.endUTC.split(':').map(Number);
    const startMins   = startH * 60 + startM;
    const endMins     = endH   * 60 + endM;
    const dateCompact = site.date.replace(/-/g, '');

    state.localFiles.forEach(f => {
      if (!f.name.includes(site.icao) || !f.name.includes(dateCompact)) return;
      const m = f.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
      if (!m) return;
      const fileMins = parseInt(m[4]) * 60 + parseInt(m[5]);
      if (fileMins >= startMins && fileMins <= endMins) names.add(f.name);
    });
  });
  return names;
}

export function refreshEventSiteStatuses(event) {
  const sitesContainer = $(`event-sites-${event.id}`);
  sitesContainer.innerHTML = '';

  event.sites.forEach(site => {
    const [startH, startM] = site.startUTC.split(':').map(Number);
    const [endH,   endM  ] = site.endUTC.split(':').map(Number);
    const startMins   = startH * 60 + startM;
    const endMins     = endH   * 60 + endM;
    const dateCompact = site.date.replace(/-/g, '');

    const matching = state.localFiles.filter(f => {
      if (!f.name.includes(site.icao) || !f.name.includes(dateCompact)) return false;
      const tm = f.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
      if (!tm) return false;
      const fileMins = parseInt(tm[4]) * 60 + parseInt(tm[5]);
      return fileMins >= startMins && fileMins <= endMins;
    });

    const windowMins  = endMins - startMins;
    const expectedMin = Math.floor(windowMins / 6);

    let statusClass = '', statusText = '';
    if (matching.length === 0) {
      statusClass = ''; statusText = 'not cached';
    } else if (matching.length >= expectedMin) {
      statusClass = 'cached'; statusText = `${matching.length} scans cached`;
    } else {
      statusClass = 'partial'; statusText = `${matching.length} scans cached`;
    }

    const row = document.createElement('div');
    row.className = 'event-site-row';
    row.innerHTML = `
      <span class="event-site-icao">${site.icao}</span>
      <span class="event-site-time">${site.label} · ${site.startUTC}–${site.endUTC} UTC</span>
      <span class="event-site-status ${statusClass}" id="event-status-${event.id}-${site.icao}">${statusText}</span>`;
    sitesContainer.appendChild(row);
  });
}

async function downloadEventScans(event) {
  const btn = $(`event-btn-${event.id}`);
  btn.disabled = true;
  btn.textContent = '⟳ DOWNLOADING...';

  let totalDownloaded = 0;
  let totalSkipped    = 0;

  for (const site of event.sites) {
    const statusEl = $(`event-status-${event.id}-${site.icao}`);
    if (statusEl) { statusEl.className = 'event-site-status downloading'; statusEl.textContent = 'fetching list...'; }

    const [year, month, day] = site.date.split('-');
    const [startH, startM]   = site.startUTC.split(':').map(Number);
    const [endH,   endM  ]   = site.endUTC.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins   = endH   * 60 + endM;

    try {
      const listRes  = await fetch(`${API}/nexrad/list?site=${site.icao}&year=${year}&month=${month}&day=${day}`);
      const listData = await listRes.json();
      if (listData.error) throw new Error(listData.error);

      const proxyRes = await fetch(listData.proxyUrl);
      const allFiles = await proxyRes.json();
      if (allFiles.error) throw new Error(allFiles.error);

      const windowFiles = allFiles.filter(key => {
        const filename = key.split('/').pop();
        const m = filename.match(/\d{8}_(\d{2})(\d{2})(\d{2})/);
        if (!m) return false;
        const fileMins = parseInt(m[1]) * 60 + parseInt(m[2]);
        return fileMins >= startMins && fileMins <= endMins;
      });

      if (statusEl) statusEl.textContent = `0 / ${windowFiles.length}`;

      let siteCount = 0;
      for (const key of windowFiles) {
        const localName     = key.replace(/\//g, '_');
        const alreadyCached = state.localFiles.some(f => f.name === localName);
        if (alreadyCached) { totalSkipped++; siteCount++; }
        else {
          try {
            const dlRes  = await fetch(`${API}/nexrad/download`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key }),
            });
            const dlData = await dlRes.json();
            if (!dlData.error) { totalDownloaded++; siteCount++; }
          } catch (_) {}
        }
        if (statusEl) statusEl.textContent = `${siteCount} / ${windowFiles.length}`;
      }

      if (statusEl) {
        statusEl.className = 'event-site-status cached';
        statusEl.textContent = `${siteCount} scans cached`;
      }

    } catch (err) {
      console.error('Event download error for', site.icao, err);
      if (statusEl) { statusEl.className = 'event-site-status'; statusEl.textContent = 'error'; }
    }
  }

  await _onDownloadComplete();
  btn.disabled = false;
  btn.textContent = '✓ ALL SCANS DOWNLOADED';
  toast(`Downloaded ${totalDownloaded} new scans (${totalSkipped} already cached)`, 'success', 5000);
  switchTab('files');
}
