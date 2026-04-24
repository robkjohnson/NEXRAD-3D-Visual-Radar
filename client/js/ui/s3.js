import { NEXRAD_SITES } from '../data/sites.js';
import { $, setLoading, switchTab, toast } from '../utils.js';
import { state } from '../state.js';
import { API } from '../api.js';

// Injected by app.js during init
let _onLoad = null;
let _onFileDownloaded = null;

export function init({ onLoad, onFileDownloaded }) {
  _onLoad = onLoad;
  _onFileDownloaded = onFileDownloaded;
}

export function renderS3FileList(files, site) {
  const container = $('s3-file-list');
  $('file-count').textContent = files.length;
  $('file-list-container').style.display = files.length ? 'block' : 'none';
  container.innerHTML = '';

  if (!files.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:12px">No files found</div>';
    return;
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Group by date
  const dateGroups = {};
  files.forEach(key => {
    const filename   = key.split('/').pop();
    const m          = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    const dateKey    = m ? `${m[1]}-${m[2]}-${m[3]}` : 'Unknown';
    const dateLabel  = m ? `${m[3]} ${months[parseInt(m[2])-1]} ${m[1]}` : 'Unknown';
    const timeLabel  = m ? `${m[4]}:${m[5]}:${m[6]} UTC` : '';
    const scanLabel  = m ? `${m[4]}:${m[5]} UTC` : filename;
    if (!dateGroups[dateKey]) dateGroups[dateKey] = { dateLabel, scans: [] };
    dateGroups[dateKey].scans.push({ key, filename, timeLabel, scanLabel });
  });

  const siteInfo = NEXRAD_SITES.find(s => s.icao === site.toUpperCase());
  const siteName = siteInfo ? `${site.toUpperCase()} — ${siteInfo.name}, ${siteInfo.state}` : site.toUpperCase();
  const siteHeader = document.createElement('div');
  siteHeader.className = 'file-group-site';
  siteHeader.innerHTML = `<span class="file-group-site-icon">◈</span><span>${siteName}</span>`;
  container.appendChild(siteHeader);

  Object.keys(dateGroups).sort().reverse().forEach(dateKey => {
    const { dateLabel, scans } = dateGroups[dateKey];

    const dateHeader = document.createElement('div');
    dateHeader.className = 'file-group-date';
    dateHeader.innerHTML = `
      <span class="file-group-date-label">${dateLabel}</span>
      <span class="file-group-date-count">${scans.length} scan${scans.length !== 1 ? 's' : ''}</span>`;

    const scanList = document.createElement('div');
    scanList.className = 'file-scan-list';
    let collapsed = false;

    dateHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      scanList.style.display = collapsed ? 'none' : 'flex';
      dateHeader.classList.toggle('collapsed', collapsed);
    });

    scans.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel)).forEach(({ key, filename, timeLabel, scanLabel }) => {
      const expectedLocalName = key.replace(/\//g, '_');
      const alreadyCached = state.localFiles.some(f => f.name === expectedLocalName);

      const item = document.createElement('div');
      item.className = 'file-scan-item' + (alreadyCached ? ' downloaded' : '');
      item.innerHTML = `
        <span class="file-scan-time">${scanLabel}</span>
        <button class="file-action s3-get-btn ${alreadyCached ? 'load' : ''}">${alreadyCached ? '▶ LOAD' : '↓ GET'}</button>`;

      const btn = item.querySelector('.s3-get-btn');

      if (alreadyCached) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          _onLoad(expectedLocalName, site);
          switchTab('files');
        });
        item.addEventListener('click', () => {
          _onLoad(expectedLocalName, site);
          switchTab('files');
        });
      }

      if (!alreadyCached) btn.addEventListener('click', async e => {
        e.stopPropagation();
        btn.textContent = '...'; btn.disabled = true;
        item.classList.add('downloading');
        try {
          setLoading(true, `Downloading ${scanLabel}...`);
          const res  = await fetch(`${API}/nexrad/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          toast(`Downloaded: ${scanLabel}`, 'success');
          btn.textContent = '▶ LOAD'; btn.classList.add('load'); btn.disabled = false;
          item.classList.remove('downloading');
          item.classList.add('downloaded');
          btn.onclick = e2 => { e2.stopPropagation(); _onLoad(data.file, site); switchTab('files'); };
          _onFileDownloaded();
        } catch (err) {
          toast('Download failed: ' + err.message, 'error');
          btn.textContent = '↓ GET'; btn.disabled = false;
          item.classList.remove('downloading');
        } finally { setLoading(false); }
      });

      scanList.appendChild(item);
    });

    container.appendChild(dateHeader);
    container.appendChild(scanList);
  });
}
