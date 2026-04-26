import { MOMENTS, MOMENT_INFO } from '../data/moments.js';
import { $, updatePointCount } from '../utils.js';
import { state } from '../state.js';

export function buildMomentButtons() {
  const container = $('moment-buttons');
  container.innerHTML = '';
  MOMENTS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'moment-btn' + (m.key === 'reflectivity' ? ' active' : '');
    btn.dataset.moment = m.key;
    btn.innerHTML = `<div style="font-size:13px;font-weight:700">${m.short}</div><div style="font-size:9px;opacity:0.6;margin-top:2px">${m.label}</div>`;
    btn.disabled = true;
    btn.title = m.label;
    container.appendChild(btn);
  });
}

export function updateMomentButtons() {
  document.querySelectorAll('.moment-btn').forEach(btn => {
    const key = btn.dataset.moment;
    btn.disabled = !state.availableMoments.has(key);
    btn.classList.toggle('active', key === window.Radar3D.currentMoment);
  });
}

export function updateColorbar(momentKey) {
  const cm = window.RadarColormaps.MAPS[momentKey];
  if (!cm) return;
  $('colorbar-title').textContent = cm.unit;
  window.RadarColormaps.drawColorbar($('colorbar-canvas'), momentKey);
  const labelEl = $('colorbar-labels');
  labelEl.innerHTML = '';
  for (let i = 5; i >= 0; i--) {
    const val = cm.min + (cm.max - cm.min) * (i / 5);
    const span = document.createElement('span');
    span.textContent = val.toFixed(0);
    labelEl.appendChild(span);
  }
  updateMomentInfoPanel(momentKey);
}

export function updateMomentInfoPanel(momentKey) {
  const info = MOMENT_INFO[momentKey];
  const cm   = window.RadarColormaps.MAPS[momentKey];
  if (!info || !cm) {
    console.warn('[Panel] No info for moment:', momentKey, '| MOMENT_INFO keys:', Object.keys(MOMENT_INFO));
    return;
  }

  const panelEl = $('moment-info-panel');
  if (panelEl) panelEl.classList.remove('collapsed');

  $('moment-info-title').textContent = info.name;
  $('moment-info-desc').textContent  = info.description;

  const cbCanvas = $('moment-cb-canvas');
  if (cbCanvas) {
    const pw = cbCanvas.parentElement ? cbCanvas.parentElement.offsetWidth : 0;
    cbCanvas.width  = pw > 10 ? pw : 240;
    cbCanvas.height = 16;
    drawHorizontalColorbar(cbCanvas, momentKey);

    const ticks = $('moment-cb-ticks');
    ticks.innerHTML = '';
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = cm.min + (cm.max - cm.min) * (i / steps);
      const tick = document.createElement('span');
      tick.className = 'cb-tick';
      tick.textContent = Number.isInteger(val) ? val : val.toFixed(1);
      ticks.appendChild(tick);
    }
    $('moment-cb-min').textContent = '';
    $('moment-cb-max').textContent = '';
  }

  buildMomentFilterControls(momentKey, info);
}

export function drawHorizontalColorbar(canvas, momentKey) {
  const cm  = window.RadarColormaps.MAPS[momentKey];
  if (!cm) return;
  const ctx = canvas.getContext('2d');
  const w   = Math.max(canvas.width, 1), h = Math.max(canvas.height, 1);
  for (let i = 0; i < w; i++) {
    const t   = w > 1 ? i / (w - 1) : 0;
    const idx = Math.min(255, Math.floor(t * 255));
    const r   = Math.round(cm.colors[idx*3]   * 255);
    const g   = Math.round(cm.colors[idx*3+1] * 255);
    const b   = Math.round(cm.colors[idx*3+2] * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i, 0, 1, h);
  }
}

export function buildMomentFilterControls(momentKey, info) {
  const container = $('moment-filter-controls');
  container.innerHTML = '';

  if (info.filterType === 'min') {
    container.innerHTML = `
      <div class="moment-filter-section">
        <div class="moment-filter-label">${info.filterLabel}</div>
        <div class="filter-range-row">
          <input type="range" id="mf-min"
            min="${info.filterMin}" max="${info.filterMax}" step="${info.filterStep}"
            value="${info.filterDefault}">
          <span class="filter-range-val" id="mf-min-val">${info.filterDefault} ${info.unit}</span>
        </div>
        <div class="filter-hint">${info.filterHint}</div>
      </div>`;

    $('mf-min').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      $('mf-min-val').textContent = v + ' ' + info.unit;
      window.Radar3D.setThreshold(v);
      updatePointCount();
    });

  } else if (info.filterType === 'exclude_near_zero') {
    container.innerHTML = `
      <div class="moment-filter-section">
        <div class="moment-filter-label">${info.filterLabel}</div>
        <div class="filter-range-row">
          <input type="range" id="mf-calm"
            min="${info.filterMin}" max="${info.filterMax}" step="${info.filterStep}"
            value="${info.filterDefault}">
          <span class="filter-range-val" id="mf-calm-val">±${info.filterDefault} ${info.unit}</span>
        </div>
        <div class="filter-hint">${info.filterHint}</div>
      </div>`;

    $('mf-calm').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      $('mf-calm-val').textContent = '±' + v + ' ' + info.unit;
      window.Radar3D.setVelocityFilter(v);
      updatePointCount();
    });

  } else if (info.filterType === 'range') {
    const defLow  = info.filterDefaultLow;
    const defHigh = info.filterDefaultHigh;
    container.innerHTML = `
      <div class="moment-filter-section">
        <div class="moment-filter-label">${info.filterLabel}</div>
        <div class="filter-range-row">
          <span style="font-size:10px;color:var(--text-muted);min-width:24px">LOW</span>
          <input type="range" id="mf-low"
            min="${info.filterMin}" max="${info.filterMax}" step="${info.filterStep}"
            value="${defLow}">
          <span class="filter-range-val" id="mf-low-val">${defLow} ${info.unit}</span>
        </div>
        <div class="filter-range-row">
          <span style="font-size:10px;color:var(--text-muted);min-width:24px">HIGH</span>
          <input type="range" id="mf-high"
            min="${info.filterMin}" max="${info.filterMax}" step="${info.filterStep}"
            value="${defHigh}">
          <span class="filter-range-val" id="mf-high-val">${defHigh} ${info.unit}</span>
        </div>
        <div class="filter-hint">${info.filterHint}</div>
      </div>`;

    const syncRange = () => {
      const lo = parseFloat($('mf-low').value);
      const hi = parseFloat($('mf-high').value);
      if (lo > hi) {
        if (document.activeElement === $('mf-low')) $('mf-low').value  = hi;
        else                                         $('mf-high').value = lo;
      }
      $('mf-low-val').textContent  = parseFloat($('mf-low').value).toFixed(2)  + ' ' + info.unit;
      $('mf-high-val').textContent = parseFloat($('mf-high').value).toFixed(2) + ' ' + info.unit;
      window.Radar3D.setRangeFilter(parseFloat($('mf-low').value), parseFloat($('mf-high').value));
      updatePointCount();
    };
    $('mf-low').addEventListener('input',  syncRange);
    $('mf-high').addEventListener('input', syncRange);
  }
}

// Re-export MOMENT_INFO so app.js can access it for filter resets without a separate import
export { MOMENT_INFO };
