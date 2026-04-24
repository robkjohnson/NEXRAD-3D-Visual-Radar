import { NEXRAD_SITES } from '../data/sites.js';
import { $, parseFileMeta, toast } from '../utils.js';
import { state } from '../state.js';
import { API } from '../api.js';

// Injected by app.js during init
let _onLoad = null;
let _getEventFileNames = null;

export function init({ onLoad, getEventFileNames }) {
  _onLoad = onLoad;
  _getEventFileNames = getEventFileNames;
}

export function renderLocalFiles(files) {
  const container = $('local-file-list');
  container.innerHTML = '';

  let filteredFiles = files;
  if (state.activeFilter !== 'all') {
    const eventNames = _getEventFileNames(state.activeFilter);
    filteredFiles = files.filter(f => eventNames.has(f.name));
  }

  if (!filteredFiles.length) {
    const msg = state.activeFilter !== 'all'
      ? 'No cached files for this event.<br>Use FETCH tab to download.'
      : 'No cached files.<br>Download from FETCH tab.';
    container.innerHTML = `<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:16px">${msg}</div>`;
    return;
  }

  // Group by site then by date
  const groups = {};
  filteredFiles.forEach(f => {
    const meta = parseFileMeta(f.name);
    if (!groups[meta.icao]) groups[meta.icao] = {};
    if (!groups[meta.icao][meta.dateKey]) groups[meta.icao][meta.dateKey] = [];
    groups[meta.icao][meta.dateKey].push({ ...f, meta });
  });

  Object.keys(groups).sort().forEach(icao => {
    const siteHeader = document.createElement('div');
    siteHeader.className = 'file-group-site';
    const siteInfo = NEXRAD_SITES.find(s => s.icao === icao);
    const siteName = siteInfo ? `${icao} — ${siteInfo.name}, ${siteInfo.state}` : icao;
    siteHeader.innerHTML = `<span class="file-group-site-icon">◈</span><span>${siteName}</span>`;
    container.appendChild(siteHeader);

    const dateMap = groups[icao];
    Object.keys(dateMap).sort().reverse().forEach(dateKey => {
      const dayFiles  = dateMap[dateKey];
      const dateLabel = dayFiles[0].meta.dateLabel;

      const dateHeader = document.createElement('div');
      dateHeader.className = 'file-group-date';
      dateHeader.innerHTML = `
        <span class="file-group-date-label">${dateLabel}</span>
        <span class="file-group-date-count">${dayFiles.length} scan${dayFiles.length !== 1 ? 's' : ''}</span>`;

      const scanList = document.createElement('div');
      scanList.className = 'file-scan-list';
      let collapsed = false;

      dateHeader.addEventListener('click', () => {
        collapsed = !collapsed;
        scanList.style.display = collapsed ? 'none' : 'flex';
        dateHeader.classList.toggle('collapsed', collapsed);
      });

      dayFiles.sort((a, b) => a.meta.timeLabel.localeCompare(b.meta.timeLabel)).forEach(f => {
        const sizeMB  = (f.size / 1024 / 1024).toFixed(1);
        const isActive = state.activeFile === f.name;

        const item = document.createElement('div');
        item.className = 'file-scan-item' + (isActive ? ' active' : '');
        item.innerHTML = `
          <span class="file-scan-time">${f.meta.scanLabel}</span>
          <span class="file-scan-size">${sizeMB}MB</span>
          <button class="file-action load">LOAD</button>
          <button class="file-action delete">✕</button>`;

        item.querySelector('.load').addEventListener('click', e => {
          e.stopPropagation();
          _onLoad(f.name, f.meta.icao);
        });

        item.querySelector('.delete').addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm(`Delete ${f.meta.dateLabel} ${f.meta.timeLabel}?`)) return;
          try {
            await fetch(`${API}/local-files/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
            toast('Deleted scan', 'info');
            // Notify app to refresh the file list
            document.dispatchEvent(new CustomEvent('local-files-changed'));
          } catch (_err) { toast('Delete failed', 'error'); }
        });

        scanList.appendChild(item);
      });

      container.appendChild(dateHeader);
      container.appendChild(scanList);
    });
  });
}
