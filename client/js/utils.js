import { NEXRAD_SITES } from './data/sites.js';

export const $ = id => document.getElementById(id);

export function extractIcaoFromFilename(filename) {
  const match = filename.match(/[KP][A-Z]{3}/g);
  if (match && match.length > 0) return match[match.length - 1];
  return filename.slice(0, 4);
}

export function getSiteCoords(icao) {
  const site = NEXRAD_SITES.find(s => s.icao === icao.toUpperCase());
  return site ? { lat: site.lat, lon: site.lon } : { lat: 35.0, lon: -97.0 };
}

export function parseFileMeta(filename) {
  const icao = extractIcaoFromFilename(filename);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const year = m[1], mon = parseInt(m[2]), day = m[3];
    const hh = m[4], mm = m[5], ss = m[6];
    return {
      icao,
      dateKey:   `${year}-${m[2]}-${day}`,
      dateLabel: `${day} ${months[mon-1]} ${year}`,
      timeLabel: `${hh}:${mm}:${ss} UTC`,
      scanLabel: `${hh}:${mm} UTC`,
    };
  }
  return { icao, dateKey: 'Unknown', dateLabel: 'Unknown Date', timeLabel: '', scanLabel: filename };
}

export function toast(msg, type = 'info', duration = 3000) {
  const tc = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

export function setLoading(active, text = 'Loading...', progress = null) {
  const bar  = $('loading-bar');
  const fill = $('loading-fill');
  bar.style.display = active ? 'block' : 'none';
  $('loading-text').textContent = text;
  if (progress !== null) {
    bar.classList.remove('indeterminate');
    fill.style.width = progress + '%';
  } else {
    bar.classList.add('indeterminate');
  }
}

export function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

export function updatePointCount() {
  $('point-count').textContent = window.Radar3D.getTotalPoints().toLocaleString() + ' pts';
}
