/**
 * NEXRAD Radar Colormaps
 * Professional NWS-style color tables for each radar moment
 */
window.RadarColormaps = (function() {

  // Build a linear interpolated colormap from control points
  function buildColormap(stops, steps = 256) {
    const colors = new Float32Array(steps * 3);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      // find surrounding stops
      let lo = stops[0], hi = stops[stops.length - 1];
      for (let j = 0; j < stops.length - 1; j++) {
        if (t >= stops[j][0] && t <= stops[j+1][0]) {
          lo = stops[j]; hi = stops[j+1]; break;
        }
      }
      const range = hi[0] - lo[0];
      const u = range < 1e-6 ? 0 : (t - lo[0]) / range;
      colors[i*3+0] = lo[1] + (hi[1] - lo[1]) * u;
      colors[i*3+1] = lo[2] + (hi[2] - lo[2]) * u;
      colors[i*3+2] = lo[3] + (hi[3] - lo[3]) * u;
    }
    return colors;
  }

  // ── REFLECTIVITY (dBZ): classic NWS multi-color ──
  // matches standard WSR-88D reflectivity display
  const REFLECTIVITY = {
    name: 'Reflectivity',
    unit: 'dBZ',
    min: -30,
    max: 75,
    colors: buildColormap([
      [0.00, 0.20, 0.20, 0.20], // -30: dark gray (no echo)
      [0.22, 0.40, 0.80, 1.00], // -10: blue
      [0.31, 0.00, 1.00, 0.60], // ~0: cyan
      [0.38, 0.00, 0.80, 0.00], // 5: dark green
      [0.46, 0.00, 1.00, 0.00], // 15: green
      [0.54, 1.00, 1.00, 0.00], // 25: yellow
      [0.62, 1.00, 0.60, 0.00], // 35: orange
      [0.70, 1.00, 0.00, 0.00], // 45: red
      [0.77, 0.80, 0.00, 0.00], // 50: dark red
      [0.84, 1.00, 0.00, 1.00], // 55: magenta
      [0.92, 1.00, 1.00, 1.00], // 65: white
      [1.00, 0.90, 0.90, 0.90], // 75: light gray (hail)
    ])
  };

  // ── VELOCITY (m/s): diverging green-white-red ──
  const VELOCITY = {
    name: 'Velocity',
    unit: 'm/s',
    min: -32,
    max: 32,
    colors: buildColormap([
      [0.00, 0.10, 0.00, 0.60], // -32: dark blue (toward)
      [0.15, 0.00, 0.40, 1.00], // -24: blue
      [0.30, 0.00, 0.80, 0.80], // -12: cyan
      [0.45, 0.10, 0.40, 0.10], // -3: dark green
      [0.50, 0.15, 0.15, 0.15], // 0: near black (zero)
      [0.55, 0.40, 0.10, 0.10], // 3: dark red
      [0.70, 1.00, 0.50, 0.00], // 12: orange
      [0.85, 1.00, 0.00, 0.00], // 24: red
      [1.00, 0.80, 0.00, 0.80], // 32: magenta (away)
    ])
  };

  // ── SPECTRUM WIDTH (m/s): yellow-orange scale ──
  const SPECTRUM = {
    name: 'Spectrum Width',
    unit: 'm/s',
    min: 0,
    max: 10,
    colors: buildColormap([
      [0.00, 0.05, 0.05, 0.10],
      [0.20, 0.00, 0.40, 0.80],
      [0.40, 0.00, 0.80, 0.40],
      [0.60, 0.80, 0.80, 0.00],
      [0.80, 1.00, 0.40, 0.00],
      [1.00, 1.00, 0.00, 0.00],
    ])
  };

  // ── DIFF REFLECTIVITY (ZDR, dB): diverging ──
  const ZDR = {
    name: 'Diff. Reflectivity',
    unit: 'dB',
    min: -2,
    max: 6,
    colors: buildColormap([
      [0.00, 0.00, 0.00, 0.80],
      [0.20, 0.00, 0.60, 1.00],
      [0.40, 0.00, 1.00, 0.40],
      [0.50, 0.50, 0.50, 0.50],
      [0.65, 1.00, 1.00, 0.00],
      [0.80, 1.00, 0.40, 0.00],
      [1.00, 1.00, 0.00, 0.40],
    ])
  };

  // ── DIFF PHASE (PhiDP, deg): cool blue-purple ──
  const PHI = {
    name: 'Diff. Phase',
    unit: '°',
    min: 0,
    max: 360,
    colors: buildColormap([
      [0.00, 0.00, 0.00, 0.40],
      [0.25, 0.20, 0.00, 0.80],
      [0.50, 0.00, 0.40, 1.00],
      [0.75, 0.40, 0.80, 1.00],
      [1.00, 1.00, 1.00, 1.00],
    ])
  };

  // ── CORRELATION COEFFICIENT (ρHV): green-yellow-red ──
  const RHO = {
    name: 'Corr. Coefficient',
    unit: 'ρHV',
    min: 0,
    max: 1.05,
    colors: buildColormap([
      [0.00, 0.40, 0.00, 0.00], // 0: dark red (non-met)
      [0.20, 0.80, 0.00, 0.00],
      [0.50, 0.80, 0.40, 0.00], // 0.5: orange
      [0.70, 0.80, 0.80, 0.00], // 0.7: yellow
      [0.80, 0.00, 0.80, 0.00], // 0.85: green (precipitation)
      [0.90, 0.00, 1.00, 0.60],
      [0.95, 0.00, 0.60, 1.00],
      [1.00, 0.60, 0.80, 1.00], // 1.0: light blue (pure rain)
    ])
  };

  // Map moment keys to colormap definitions
  const MAPS = {
    reflectivity: REFLECTIVITY,
    velocity: VELOCITY,
    spectrum: SPECTRUM,
    zdr: ZDR,
    phi: PHI,
    rho: RHO,
  };

  // Get RGB THREE.Color for a value
  function getColor(momentKey, value) {
    const cm = MAPS[momentKey];
    if (!cm) return new THREE.Color(0.5, 0.5, 0.5);
    const t = Math.max(0, Math.min(1, (value - cm.min) / (cm.max - cm.min)));
    const idx = Math.floor(t * 255);
    return new THREE.Color(cm.colors[idx*3], cm.colors[idx*3+1], cm.colors[idx*3+2]);
  }

  // Get raw RGB array for a value (faster, no THREE.Color)
  function getRGB(momentKey, value) {
    const cm = MAPS[momentKey];
    if (!cm) return [0.5, 0.5, 0.5];
    const t = Math.max(0, Math.min(1, (value - cm.min) / (cm.max - cm.min)));
    const idx = Math.min(255, Math.floor(t * 255));
    return [cm.colors[idx*3], cm.colors[idx*3+1], cm.colors[idx*3+2]];
  }

  // Draw colorbar onto a canvas
  function drawColorbar(canvas, momentKey) {
    const cm = MAPS[momentKey];
    if (!cm) return;
    const ctx = canvas.getContext('2d');
    const h = canvas.height;
    const w = canvas.width;
    for (let i = 0; i < h; i++) {
      const t = 1 - i / (h - 1);
      const idx = Math.min(255, Math.floor(t * 255));
      const r = Math.round(cm.colors[idx*3] * 255);
      const g = Math.round(cm.colors[idx*3+1] * 255);
      const b = Math.round(cm.colors[idx*3+2] * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, i, w, 1);
    }
  }

  return { MAPS, getColor, getRGB, drawColorbar };
})();