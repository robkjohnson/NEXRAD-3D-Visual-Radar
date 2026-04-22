/**
 * app.js — Main application controller
 * Manages UI, API communication, and coordinates with Radar3D (Cesium) renderer
 */
(function () {
  'use strict';

  const API = 'http://localhost:3000/api';

  // NEXRAD site database with lat/lon coordinates
  const NEXRAD_SITES = [
    { icao:'KABR', name:'Aberdeen',           state:'SD', lat:45.4558, lon:-98.4132 },
    { icao:'KAKQ', name:'Norfolk/Wakefield',  state:'VA', lat:36.9839, lon:-77.0078 },
    { icao:'KAMA', name:'Amarillo',           state:'TX', lat:35.2333, lon:-101.7092 },
    { icao:'KAMX', name:'Miami',              state:'FL', lat:25.6111, lon:-80.4128 },
    { icao:'KAPX', name:'Gaylord',            state:'MI', lat:44.9072, lon:-84.7197 },
    { icao:'KARX', name:'La Crosse',          state:'WI', lat:43.8228, lon:-91.1915 },
    { icao:'KATX', name:'Seattle/Tacoma',     state:'WA', lat:48.1947, lon:-122.4958 },
    { icao:'KBGM', name:'Binghamton',         state:'NY', lat:42.1997, lon:-75.9847 },
    { icao:'KBIS', name:'Bismarck',           state:'ND', lat:46.7708, lon:-100.7603 },
    { icao:'KBLX', name:'Billings',           state:'MT', lat:45.8538, lon:-108.6068 },
    { icao:'KBMX', name:'Birmingham',         state:'AL', lat:33.1722, lon:-86.7697 },
    { icao:'KBOX', name:'Boston/Taunton',     state:'MA', lat:41.9558, lon:-71.1369 },
    { icao:'KBRO', name:'Brownsville',        state:'TX', lat:25.9158, lon:-97.4189 },
    { icao:'KBUF', name:'Buffalo',            state:'NY', lat:42.9489, lon:-78.7369 },
    { icao:'KCAE', name:'Columbia',           state:'SC', lat:33.9486, lon:-81.1181 },
    { icao:'KCBX', name:'Boise',              state:'ID', lat:43.4911, lon:-116.2358 },
    { icao:'KCCX', name:'State College',      state:'PA', lat:40.9228, lon:-78.0039 },
    { icao:'KCLE', name:'Cleveland',          state:'OH', lat:41.4131, lon:-81.8597 },
    { icao:'KCLX', name:'Charleston',         state:'SC', lat:32.6558, lon:-81.0422 },
    { icao:'KCRP', name:'Corpus Christi',     state:'TX', lat:27.7842, lon:-97.5111 },
    { icao:'KCXX', name:'Burlington',         state:'VT', lat:44.5111, lon:-73.1661 },
    { icao:'KCYS', name:'Cheyenne',           state:'WY', lat:41.1519, lon:-104.8061 },
    { icao:'KDAX', name:'Sacramento',         state:'CA', lat:38.5011, lon:-121.6778 },
    { icao:'KDDC', name:'Dodge City',         state:'KS', lat:37.7208, lon:-99.9689 },
    { icao:'KDGX', name:'Jackson/Brandon',    state:'MS', lat:32.2800, lon:-89.9844 },
    { icao:'KDIX', name:'Philadelphia',       state:'NJ', lat:39.9469, lon:-74.4108 },
    { icao:'KDLH', name:'Duluth',             state:'MN', lat:46.8369, lon:-92.2097 },
    { icao:'KDMX', name:'Des Moines',         state:'IA', lat:41.7311, lon:-93.7228 },
    { icao:'KDTX', name:'Detroit',            state:'MI', lat:42.6997, lon:-83.4717 },
    { icao:'KDVN', name:'Quad Cities',        state:'IA', lat:41.6117, lon:-90.5808 },
    { icao:'KEAX', name:'Kansas City',        state:'MO', lat:38.8103, lon:-94.2644 },
    { icao:'KEMX', name:'Tucson',             state:'AZ', lat:31.8933, lon:-110.6303 },
    { icao:'KENX', name:'Albany',             state:'NY', lat:42.5864, lon:-74.0642 },
    { icao:'KEPZ', name:'El Paso',            state:'TX', lat:31.8731, lon:-106.6981 },
    { icao:'KESX', name:'Las Vegas',          state:'NV', lat:35.7011, lon:-114.8914 },
    { icao:'KEWX', name:'Austin/San Antonio', state:'TX', lat:29.7039, lon:-98.0283 },
    { icao:'KFCX', name:'Roanoke',            state:'VA', lat:37.0242, lon:-80.2742 },
    { icao:'KFFC', name:'Atlanta',            state:'GA', lat:33.3636, lon:-84.5658 },
    { icao:'KFSD', name:'Sioux Falls',        state:'SD', lat:43.5878, lon:-96.7294 },
    { icao:'KFTG', name:'Denver',             state:'CO', lat:39.7867, lon:-104.5458 },
    { icao:'KFWS', name:'Dallas/Fort Worth',  state:'TX', lat:32.5728, lon:-97.3031 },
    { icao:'KGGW', name:'Glasgow',            state:'MT', lat:48.2064, lon:-106.6253 },
    { icao:'KGJX', name:'Grand Junction',     state:'CO', lat:39.0622, lon:-108.2139 },
    { icao:'KGLD', name:'Goodland',           state:'KS', lat:39.3667, lon:-101.7003 },
    { icao:'KGRB', name:'Green Bay',          state:'WI', lat:44.4986, lon:-88.1111 },
    { icao:'KGRR', name:'Grand Rapids',       state:'MI', lat:42.8939, lon:-85.5447 },
    { icao:'KGSP', name:'Greenville',         state:'SC', lat:34.8833, lon:-82.2203 },
    { icao:'KGYX', name:'Portland',           state:'ME', lat:43.8914, lon:-70.2569 },
    { icao:'KHGX', name:'Houston/Galveston',  state:'TX', lat:29.4719, lon:-95.0792 },
    { icao:'KHTX', name:'Huntsville',         state:'AL', lat:34.9306, lon:-86.0836 },
    { icao:'KICT', name:'Wichita',            state:'KS', lat:37.6544, lon:-97.4433 },
    { icao:'KILN', name:'Cincinnati',         state:'OH', lat:39.4203, lon:-83.8217 },
    { icao:'KILX', name:'Lincoln',            state:'IL', lat:40.1506, lon:-89.3367 },
    { icao:'KIND', name:'Indianapolis',       state:'IN', lat:39.7075, lon:-86.2803 },
    { icao:'KINX', name:'Tulsa',              state:'OK', lat:36.1750, lon:-95.5644 },
    { icao:'KIWA', name:'Phoenix',            state:'AZ', lat:33.2892, lon:-111.6700 },
    { icao:'KJAX', name:'Jacksonville',       state:'FL', lat:30.4847, lon:-81.7019 },
    { icao:'KLCH', name:'Lake Charles',       state:'LA', lat:30.1253, lon:-93.2158 },
    { icao:'KLIX', name:'New Orleans',        state:'LA', lat:30.3367, lon:-89.8253 },
    { icao:'KLNX', name:'North Platte',       state:'NE', lat:41.9578, lon:-100.5758 },
    { icao:'KLOT', name:'Chicago',            state:'IL', lat:41.6044, lon:-88.0847 },
    { icao:'KLSX', name:'St. Louis',          state:'MO', lat:38.6986, lon:-90.6828 },
    { icao:'KLTX', name:'Wilmington',         state:'NC', lat:33.9894, lon:-78.4292 },
    { icao:'KLVX', name:'Louisville',         state:'KY', lat:37.9753, lon:-85.9439 },
    { icao:'KLWX', name:'Baltimore/Washington',state:'VA',lat:38.9753, lon:-77.4778 },
    { icao:'KLZK', name:'Little Rock',        state:'AR', lat:34.8364, lon:-92.2619 },
    { icao:'KMAF', name:'Midland/Odessa',     state:'TX', lat:31.9433, lon:-102.1894 },
    { icao:'KMAX', name:'Medford',            state:'OR', lat:42.0811, lon:-122.7158 },
    { icao:'KMBX', name:'Minot AFB',          state:'ND', lat:48.3928, lon:-100.8644 },
    { icao:'KMHX', name:'Morehead City',      state:'NC', lat:34.7761, lon:-76.8764 },
    { icao:'KMKX', name:'Milwaukee',          state:'WI', lat:42.9678, lon:-88.5506 },
    { icao:'KMLB', name:'Melbourne',          state:'FL', lat:28.1133, lon:-80.6542 },
    { icao:'KMOB', name:'Mobile',             state:'AL', lat:30.6794, lon:-88.2397 },
    { icao:'KMPX', name:'Minneapolis',        state:'MN', lat:44.8489, lon:-93.5653 },
    { icao:'KMRX', name:'Knoxville',          state:'TN', lat:36.1683, lon:-83.4017 },
    { icao:'KMTX', name:'Salt Lake City',     state:'UT', lat:41.2628, lon:-112.4478 },
    { icao:'KMUX', name:'San Francisco',      state:'CA', lat:37.1553, lon:-121.8983 },
    { icao:'KMVX', name:'Grand Forks',        state:'ND', lat:47.5281, lon:-97.3253 },
    { icao:'KNKX', name:'San Diego',          state:'CA', lat:32.9189, lon:-117.0419 },
    { icao:'KNQA', name:'Memphis',            state:'TN', lat:35.3447, lon:-89.8733 },
    { icao:'KOAX', name:'Omaha',              state:'NE', lat:41.3203, lon:-96.3661 },
    { icao:'KOHX', name:'Nashville',          state:'TN', lat:36.2472, lon:-86.5625 },
    { icao:'KOKX', name:'New York City',      state:'NY', lat:40.8656, lon:-72.8639 },
    { icao:'KOTX', name:'Spokane',            state:'WA', lat:47.6803, lon:-117.6267 },
    { icao:'KPAH', name:'Paducah',            state:'KY', lat:37.0683, lon:-88.7719 },
    { icao:'KPBZ', name:'Pittsburgh',         state:'PA', lat:40.5317, lon:-80.2181 },
    { icao:'KPDT', name:'Pendleton',          state:'OR', lat:45.6906, lon:-118.8528 },
    { icao:'KPUX', name:'Pueblo',             state:'CO', lat:38.4595, lon:-104.1814 },
    { icao:'KRAX', name:'Raleigh/Durham',     state:'NC', lat:35.6656, lon:-78.4897 },
    { icao:'KRGX', name:'Reno',               state:'NV', lat:39.7542, lon:-119.4611 },
    { icao:'KRIW', name:'Riverton',           state:'WY', lat:43.0661, lon:-108.4772 },
    { icao:'KRLX', name:'Charleston',         state:'WV', lat:38.3111, lon:-81.7228 },
    { icao:'KRTX', name:'Portland',           state:'OR', lat:45.7150, lon:-122.9650 },
    { icao:'KSFX', name:'Pocatello',          state:'ID', lat:43.1056, lon:-112.6861 },
    { icao:'KSGF', name:'Springfield',        state:'MO', lat:37.2353, lon:-93.4006 },
    { icao:'KSHV', name:'Shreveport',         state:'LA', lat:32.4508, lon:-93.8411 },
    { icao:'KSOX', name:'Santa Ana Mtns',     state:'CA', lat:33.8178, lon:-117.6358 },
    { icao:'KSRX', name:'Fort Smith',         state:'AR', lat:35.2906, lon:-94.3619 },
    { icao:'KTBW', name:'Tampa Bay',          state:'FL', lat:27.7056, lon:-82.4017 },
    { icao:'KTFX', name:'Great Falls',        state:'MT', lat:47.4597, lon:-111.3853 },
    { icao:'KTLH', name:'Tallahassee',        state:'FL', lat:30.3975, lon:-84.3289 },
    { icao:'KTLX', name:'Oklahoma City',      state:'OK', lat:35.3331, lon:-97.2775 },
    { icao:'KTWX', name:'Topeka',             state:'KS', lat:38.9969, lon:-96.2325 },
    { icao:'KTYX', name:'Montague',           state:'NY', lat:43.7558, lon:-75.6800 },
    { icao:'KUDX', name:'Rapid City',         state:'SD', lat:44.1250, lon:-102.8297 },
    { icao:'KUEX', name:'Grand Island',       state:'NE', lat:40.3208, lon:-98.4417 },
    { icao:'KVAX', name:'Moody AFB',          state:'GA', lat:30.8903, lon:-83.0019 },
    { icao:'KVBX', name:'Vandenberg AFB',     state:'CA', lat:34.8381, lon:-120.3978 },
    { icao:'KVNX', name:'Vance AFB',          state:'OK', lat:36.7408, lon:-98.1278 },
    { icao:'KVTX', name:'Los Angeles',        state:'CA', lat:34.4117, lon:-119.1797 },
    { icao:'KVWX', name:'Evansville',         state:'IN', lat:38.2603, lon:-87.7247 },
    { icao:'KYUX', name:'Yuma',               state:'AZ', lat:32.4953, lon:-114.6567 },
  ].sort((a, b) => a.state.localeCompare(b.state) || a.icao.localeCompare(b.icao));

  const MOMENTS = [
    { key: 'reflectivity', label: 'REFLECTIVITY', short: 'REF' },
    { key: 'velocity',     label: 'VELOCITY',     short: 'VEL' },
    { key: 'spectrum',     label: 'SPEC WIDTH',   short: 'SW'  },
    { key: 'zdr',          label: 'DIFF REFL',    short: 'ZDR' },
    { key: 'phi',          label: 'DIFF PHASE',   short: 'PHI' },
    { key: 'rho',          label: 'CORR COEFF',   short: 'RHO' },
  ];

  // ── Moment metadata & filter definitions ──────────────────────────────────
  const MOMENT_INFO = {
    reflectivity: {
      name: 'Reflectivity (REF)',
      unit: 'dBZ',
      description: 'Measures the intensity of returned radar energy — a proxy for precipitation rate. Higher values (yellows, reds, purples) indicate heavier rain, hail, or large snowflakes. Values below 20 dBZ are light rain or drizzle. Above 50 dBZ typically indicates heavy rain or hail.',
      filterType: 'min',
      filterLabel: 'MIN THRESHOLD',
      filterMin: -30, filterMax: 75, filterStep: 1, filterDefault: -30,
      filterHint: 'Hide echoes below this value. Raise to 10–20 dBZ to remove noise and light drizzle and focus on significant precipitation.',
    },
    velocity: {
      name: 'Radial Velocity (VEL)',
      unit: 'm/s',
      description: 'Shows wind speed toward (negative, greens/blues) or away from (positive, reds/oranges) the radar. Does not show cross-beam winds. Used to detect rotation — a tight couplet of inbound/outbound velocities side-by-side indicates a mesocyclone or tornado.',
      filterType: 'exclude_near_zero',
      filterLabel: 'HIDE CALM WINDS (±)',
      filterMin: 0, filterMax: 20, filterStep: 0.5, filterDefault: 0,
      filterHint: 'Removes near-zero velocities to highlight strong inflow/outflow. Useful for isolating rotation or jet-level winds from clutter.',
    },
    spectrum: {
      name: 'Spectrum Width (SW)',
      unit: 'm/s',
      description: 'Represents the spread of radial velocities within a single radar sample volume — a measure of turbulence and wind shear. High values near storm tops indicate severe turbulence. High values at low levels near a tornado can indicate the chaotic wind field.',
      filterType: 'min',
      filterLabel: 'MIN THRESHOLD',
      filterMin: 0, filterMax: 10, filterStep: 0.1, filterDefault: 0,
      filterHint: 'Hide low turbulence areas. Raise to focus on regions of significant wind shear.',
    },
    zdr: {
      name: 'Differential Reflectivity (ZDR)',
      unit: 'dB',
      description: 'The ratio of reflected power in horizontal vs vertical. Positive values indicate oblate drops (large raindrops flatten as they fall). Near-zero values indicate spherical targets like small rain or hail tumbling in flight. High ZDR columns extending vertically into a storm mark strong updrafts lofting large drops.',
      filterType: 'range',
      filterLabel: 'VALUE RANGE',
      filterMin: -2, filterMax: 6, filterStep: 0.1,
      filterDefaultLow: -2, filterDefaultHigh: 6,
      filterHint: 'Narrow the range to isolate specific drop types. E.g. 1–4 dB highlights large raindrops; near 0 dB shows hail.',
    },
    phi: {
      name: 'Differential Phase (ΦDP)',
      unit: '°',
      description: 'The accumulated phase difference between horizontal and vertical pulses as they travel through precipitation. Increases with liquid water content along the beam path. Useful for estimating rainfall totals and identifying the presence of large raindrops vs hail, which has near-zero phase shift.',
      filterType: 'min',
      filterLabel: 'MIN THRESHOLD',
      filterMin: 0, filterMax: 180, filterStep: 1, filterDefault: 0,
      filterHint: 'Higher values indicate denser liquid precipitation along the beam. Filter low values to highlight the heaviest rain corridors.',
    },
    rho: {
      name: 'Correlation Coefficient (ρHV)',
      unit: 'ρHV',
      description: 'Measures how consistently targets are scattering the horizontal and vertical pulses. Pure rain scores near 1.0 (light blue). Mixed-phase (rain+ice) drops to 0.90–0.97. Hail, debris, and birds score below 0.85. The tornado debris signature (TDS) — very low ρHV co-located with high REF and large rotation — is a direct indicator of an ongoing tornado.',
      filterType: 'range',
      filterLabel: 'VALUE RANGE',
      filterMin: 0, filterMax: 1.05, filterStep: 0.01,
      filterDefaultLow: 0, filterDefaultHigh: 1.05,
      filterHint: 'Narrow to 0–0.8 to isolate debris/hail/mixed-phase. Or set 0.95–1.05 to show only pure rain.',
    },
  };

  // ── Notable Weather Events ─────────────────────────────────────────────
  const WEATHER_EVENTS = [
    {
      id:          'ringle-wi-tornado-2026',
      title:       'Ringle, WI Tornado',
      date:        '17 Apr 2026',
      type:        'tornado',
      description: 'EF-scale tornado touched down near Ringle, Wisconsin. Captured by both KARX (La Crosse) and KGRB (Green Bay) radars.',
      sites: [
        { icao: 'KARX', label: 'La Crosse',  date: '2026-04-17', startUTC: '21:30', endUTC: '22:00' },
        { icao: 'KGRB', label: 'Green Bay',  date: '2026-04-17', startUTC: '21:30', endUTC: '22:00' },
      ],
    },
    // Add more events here
  ];

  let state = {
    radarData: null,
    availableMoments: new Set(),
    activeFile: null,
    activeSite: null,
    localFiles: [],
    s3Files: [],
    activeFilter: 'all',  // 'all' or event id
    siteScans: [],        // ordered list of local files for the active site
    scanIndex: -1,        // index of active file in siteScans
  };

  const $ = id => document.getElementById(id);

  // Extract ICAO from a cached filename like:
  // "2024_05_06_KTLX_KTLX20240506_001234_V06" -> "KTLX"
  // "KTLX20240506_001234_V06" -> "KTLX"
  function extractIcaoFromFilename(filename) {
    // Try matching a K/P + 3-letter ICAO pattern (e.g. KTLX, KGRB, PABC)
    const match = filename.match(/[KP][A-Z]{3}/g);
    if (match && match.length > 0) return match[match.length - 1]; // last match is usually the site
    return filename.slice(0, 4); // fallback
  }

  function init() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    $('date-input').value = d.toISOString().slice(0, 10);

    Radar3D.init('cesium-container');

    buildMomentButtons();
    buildSiteGrid();
    buildEventsList();
    buildEventFilterChips();
    setupEventListeners();
    loadLocalFiles();

    // Ensure info panel starts expanded and shows default moment
    const panel = $('moment-info-panel');
    if (panel) {
      panel.classList.remove('collapsed');
      try {
        updateMomentInfoPanel('reflectivity');
        console.log('[Panel] Init render OK');
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

  function buildMomentButtons() {
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

  function updateMomentButtons() {
    document.querySelectorAll('.moment-btn').forEach(btn => {
      const key = btn.dataset.moment;
      btn.disabled = !state.availableMoments.has(key);
      btn.classList.toggle('active', key === Radar3D.currentMoment);
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function buildEventsList() {
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

      // Toggle expand/collapse
      card.querySelector('.event-card-header').addEventListener('click', () => {
        const body = $(`event-body-${event.id}`);
        const isOpen = body.classList.contains('open');
        // Close all others
        document.querySelectorAll('.event-card-body').forEach(b => b.classList.remove('open'));
        if (!isOpen) {
          body.classList.add('open');
          refreshEventSiteStatuses(event);
        }
      });

      // Download all button
      card.querySelector(`#event-btn-${event.id}`).addEventListener('click', async (e) => {
        e.stopPropagation();
        await downloadEventScans(event);
      });

      container.appendChild(card);
    });
  }

  function refreshEventSiteStatuses(event) {
    const sitesContainer = $(`event-sites-${event.id}`);
    sitesContainer.innerHTML = '';

    event.sites.forEach(site => {
      // Count how many local files match this site+date and fall in the time window
      const [startH, startM] = site.startUTC.split(':').map(Number);
      const [endH,   endM  ] = site.endUTC.split(':').map(Number);
      const startMins = startH * 60 + startM;
      const endMins   = endH   * 60 + endM;
      const dateCompact = site.date.replace(/-/g, '');

      const matching = state.localFiles.filter(f => {
        if (!f.name.includes(site.icao) || !f.name.includes(dateCompact)) return false;
        const tm = f.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (!tm) return false;
        const fileMins = parseInt(tm[4]) * 60 + parseInt(tm[5]);
        return fileMins >= startMins && fileMins <= endMins;
      });

      // Estimate expected scan count (~1 scan per 5 min = ~6 scans per 30 min window)
      const windowMins  = endMins - startMins;
      const expectedMin = Math.floor(windowMins / 6);
      const expectedMax = Math.ceil(windowMins / 4);

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
        // Get file list for this site+date
        const listRes  = await fetch(`${API}/nexrad/list?site=${site.icao}&year=${year}&month=${month}&day=${day}`);
        const listData = await listRes.json();
        if (listData.error) throw new Error(listData.error);

        const proxyRes = await fetch(listData.proxyUrl);
        const allFiles = await proxyRes.json();
        if (allFiles.error) throw new Error(allFiles.error);

        // Filter to time window
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
          const localName = key.replace(/\//g, '_');
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

    await loadLocalFiles();
    btn.disabled = false;
    btn.textContent = '✓ ALL SCANS DOWNLOADED';
    toast(`Downloaded ${totalDownloaded} new scans (${totalSkipped} already cached)`, 'success', 5000);
    switchTab('files');
  }

  function buildEventFilterChips() {
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

    // Wire up the ALL chip
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
  function getEventFileNames(eventId) {
    const event = WEATHER_EVENTS.find(e => e.id === eventId);
    if (!event) return new Set();

    const names = new Set();
    event.sites.forEach(site => {
      const [startH, startM] = site.startUTC.split(':').map(Number);
      const [endH,   endM  ] = site.endUTC.split(':').map(Number);
      const startMins  = startH * 60 + startM;
      const endMins    = endH   * 60 + endM;
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

  function buildSiteGrid(filter = '') {
    const grid = $('site-grid');
    grid.innerHTML = '';
    const lf = filter.toLowerCase();
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
        $('site-input').value = s.icao;
        $('site-modal').style.display = 'none';
      });
      grid.appendChild(card);
    });
  }

  function buildElevationList() {
    const container = $('elevation-list');
    container.innerHTML = '';
    if (!state.radarData) return;

    const allBtn = document.createElement('div');
    allBtn.className = 'elev-all-toggle' + (Radar3D.showAllElevs ? ' active' : '');
    allBtn.textContent = 'ALL TILTS';
    allBtn.addEventListener('click', () => {
      const newVal = !Radar3D.showAllElevs;
      Radar3D.setShowAllElevations(newVal);
      allBtn.classList.toggle('active', newVal);
      // Update each angle group item's active state
      document.querySelectorAll('.elev-item').forEach(el => {
        el.classList.toggle('active', newVal);
      });
      updatePointCount();
    });
    container.appendChild(allBtn);

    // Group elevations by rounded angle, then sort ascending
    // NEXRAD scans the same angle multiple times with different moments (e.g. REF vs VEL)
    // We group them so the user sees one entry per angle with all available moments listed
    const angleGroups = {};
    state.radarData.elevations.forEach((elev, idx) => {
      const angleKey = (elev.elevationAngle || 0).toFixed(2);
      if (!angleGroups[angleKey]) angleGroups[angleKey] = [];
      angleGroups[angleKey].push({ elev, idx });
    });

    const sortedGroups = Object.entries(angleGroups)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

    sortedGroups.forEach(([angleKey, entries]) => {
      // Collect all unique moments across all cuts at this angle
      const allMoments = new Set();
      entries.forEach(({ elev }) => Object.keys(elev.data).forEach(k => allMoments.add(k)));

      // Map moment keys to short labels in a fixed display order
      const momentOrder = ['reflectivity','velocity','spectrum','zdr','phi','rho'];
      const momentShort = { reflectivity:'REF', velocity:'VEL', spectrum:'SW', zdr:'ZDR', phi:'PHI', rho:'RHO' };
      const momentTags = momentOrder
        .filter(k => allMoments.has(k))
        .map(k => `<span class="moment-tag">${momentShort[k]}</span>`)
        .join('');

      // All internal indices for this angle group (for multi-cut toggling)
      const indices = entries.map(e => e.idx);
      const isActive = indices.some(i => Radar3D.currentElevations.has(i)) || Radar3D.showAllElevs;

      const item = document.createElement('div');
      item.className = 'elev-item' + (isActive ? ' active' : '');
      item.innerHTML = `
        <span class="elev-angle">${angleKey}°</span>
        <span class="elev-moments">${momentTags}</span>
        ${entries.length > 1 ? `<span class="elev-cuts">${entries.length} cuts</span>` : ''}
      `;

      item.addEventListener('click', () => {
        // If "all tilts" is on, first populate currentElevations with every
        // elevation index so we can deselect individual ones cleanly
        if (Radar3D.showAllElevs) {
          state.radarData.elevations.forEach((_, i) => Radar3D.currentElevations.add(i));
          Radar3D.setShowAllElevations(false);
          allBtn.classList.remove('active');
          // Mark all angle group items as active to match
          document.querySelectorAll('.elev-item').forEach(el => el.classList.add('active'));
        }

        const nowActive = indices.some(i => Radar3D.currentElevations.has(i));
        if (nowActive) {
          indices.forEach(i => Radar3D.currentElevations.delete(i));
        } else {
          indices.forEach(i => Radar3D.currentElevations.add(i));
        }
        Radar3D.syncVisibility();
        item.classList.toggle('active', !nowActive);
        updatePointCount();
      });

      container.appendChild(item);
    });
  }

  function updateColorbar(momentKey) {
    // Side colorbar (always visible)
    const cm = RadarColormaps.MAPS[momentKey];
    if (!cm) return;
    $('colorbar-title').textContent = cm.unit;
    RadarColormaps.drawColorbar($('colorbar-canvas'), momentKey);
    const labelEl = $('colorbar-labels');
    labelEl.innerHTML = '';
    for (let i = 5; i >= 0; i--) {
      const val = cm.min + (cm.max - cm.min) * (i / 5);
      const span = document.createElement('span');
      span.textContent = val.toFixed(0);
      labelEl.appendChild(span);
    }

    // Update moment info panel
    updateMomentInfoPanel(momentKey);
  }

  function updateMomentInfoPanel(momentKey) {
    const info = MOMENT_INFO[momentKey];
    const cm   = RadarColormaps.MAPS[momentKey];
    if (!info || !cm) {
      console.warn('[Panel] No info for moment:', momentKey, '| MOMENT_INFO keys:', Object.keys(MOMENT_INFO));
      return;
    }

    console.log('[Panel] Updating for:', momentKey);
    const panelEl = $('moment-info-panel');
    const titleEl = $('moment-info-title');
    const descEl  = $('moment-info-desc');
    console.log('[Panel] Elements found:', !!panelEl, !!titleEl, !!descEl);
    console.log('[Panel] Panel classes:', panelEl?.className);
    console.log('[Panel] Tab active:', $('tab-display')?.classList.contains('active'));

    // Ensure panel is not collapsed
    if (panelEl) panelEl.classList.remove('collapsed');

    // Title
    $('moment-info-title').textContent = info.name;
    $('moment-info-desc').textContent  = info.description;

    // Horizontal colorbar
    const cbCanvas = $('moment-cb-canvas');
    if (cbCanvas) {
      const pw = cbCanvas.parentElement ? cbCanvas.parentElement.offsetWidth : 0;
      cbCanvas.width  = pw > 10 ? pw : 240;
      cbCanvas.height = 16;
      drawHorizontalColorbar(cbCanvas, momentKey);

      // Tick labels
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

    // Filter controls
    buildMomentFilterControls(momentKey, info);
  }

  function drawHorizontalColorbar(canvas, momentKey) {
    const cm  = RadarColormaps.MAPS[momentKey];
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

  function buildMomentFilterControls(momentKey, info) {
    const container = $('moment-filter-controls');
    container.innerHTML = '';

    if (info.filterType === 'min') {
      // Single minimum threshold
      const current = Radar3D.getThreshold ? Radar3D.getThreshold() : info.filterDefault;
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
        Radar3D.setThreshold(v);
        updatePointCount();
      });

    } else if (info.filterType === 'exclude_near_zero') {
      // Velocity: exclude band around zero
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
        Radar3D.setVelocityFilter(v);
        updatePointCount();
      });

    } else if (info.filterType === 'range') {
      // ZDR / RHO: keep only values within a range
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
          if (document.activeElement === $('mf-low'))  $('mf-low').value  = hi;
          else                                          $('mf-high').value = lo;
        }
        $('mf-low-val').textContent  = parseFloat($('mf-low').value).toFixed(2)  + ' ' + info.unit;
        $('mf-high-val').textContent = parseFloat($('mf-high').value).toFixed(2) + ' ' + info.unit;
        Radar3D.setRangeFilter(parseFloat($('mf-low').value), parseFloat($('mf-high').value));
        updatePointCount();
      };
      $('mf-low').addEventListener('input',  syncRange);
      $('mf-high').addEventListener('input', syncRange);
    }
  }

  function setLoading(active, text = 'Loading...', progress = null) {
    const bar = $('loading-bar');
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

  function updatePointCount() {
    $('point-count').textContent = Radar3D.getTotalPoints().toLocaleString() + ' pts';
  }

  function toast(msg, type = 'info', duration = 3000) {
    const tc = $('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    tc.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  function getSiteCoords(icao) {
    const site = NEXRAD_SITES.find(s => s.icao === icao.toUpperCase());
    return site ? { lat: site.lat, lon: site.lon } : { lat: 35.0, lon: -97.0 };
  }

  async function listS3Files() {
    const site = $('site-input').value.trim().toUpperCase();
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
      const files = await filesRes.json();
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

  function renderS3FileList(files, site) {
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
      const filename = key.split('/').pop();
      const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
      const dateKey   = m ? `${m[1]}-${m[2]}-${m[3]}` : 'Unknown';
      const dateLabel = m ? `${m[3]} ${months[parseInt(m[2])-1]} ${m[1]}` : 'Unknown';
      const timeLabel = m ? `${m[4]}:${m[5]}:${m[6]} UTC` : '';
      const scanLabel = m ? `${m[4]}:${m[5]} UTC` : filename;
      if (!dateGroups[dateKey]) dateGroups[dateKey] = { dateLabel, scans: [] };
      dateGroups[dateKey].scans.push({ key, filename, timeLabel, scanLabel });
    });

    // Site header
    const siteInfo = NEXRAD_SITES.find(s => s.icao === site.toUpperCase());
    const siteName  = siteInfo ? `${site.toUpperCase()} — ${siteInfo.name}, ${siteInfo.state}` : site.toUpperCase();
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
        // Check if this file is already cached locally
        const expectedLocalName = key.replace(/\//g, '_');
        const alreadyCached = state.localFiles.some(f => f.name === expectedLocalName);

        const item = document.createElement('div');
        item.className = 'file-scan-item' + (alreadyCached ? ' downloaded' : '');
        item.innerHTML = `
          <span class="file-scan-time">${scanLabel}</span>
          <button class="file-action s3-get-btn ${alreadyCached ? 'load' : ''}">${alreadyCached ? '▶ LOAD' : '↓ GET'}</button>`;

        const btn = item.querySelector('.s3-get-btn');

        // If already cached, wire up load directly
        if (alreadyCached) {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            loadRadarFile(expectedLocalName, site);
            switchTab('files');
          });
          item.addEventListener('click', () => {
            loadRadarFile(expectedLocalName, site);
            switchTab('files');
          });
        }

        if (!alreadyCached) btn.addEventListener('click', async e => {
          e.stopPropagation();
          btn.textContent = '...'; btn.disabled = true;
          item.classList.add('downloading');
          try {
            setLoading(true, `Downloading ${scanLabel}...`);
            const res = await fetch(`${API}/nexrad/download`, {
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
            btn.onclick = e2 => { e2.stopPropagation(); loadRadarFile(data.file, site); switchTab('files'); };
            loadLocalFiles();
          } catch (err) {
            toast('Download failed: ' + err.message, 'error');
            btn.textContent = '↓ GET'; btn.disabled = false;
            item.classList.remove('downloading');
          } finally { setLoading(false); }
        }); // end if (!alreadyCached)

        scanList.appendChild(item);
      });

      container.appendChild(dateHeader);
      container.appendChild(scanList);
    });
  }

  async function loadLocalFiles() {
    try {
      const res = await fetch(`${API}/local-files`);
      const files = await res.json();
      state.localFiles = files;
      renderLocalFiles(files);
      // Refresh scan nav if a file is already loaded
      if (state.activeFile && state.activeSite) {
        buildScanList(state.activeFile, state.activeSite.icao);
      }
    } catch (err) { console.warn('Could not load local files:', err); }
  }

  // Parse a cached filename into { icao, date, time, label }
  // Filenames look like: 2024_05_06_KTLX_KTLX20240506_012345_V06
  // or just: KTLX20240506_012345_V06
  function parseFileMeta(filename) {
    const icao = extractIcaoFromFilename(filename);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const year = m[1], mon = parseInt(m[2]), day = m[3];
      const hh = m[4], mm = m[5], ss = m[6];
      return {
        icao,
        dateKey:  `${year}-${m[2]}-${day}`,                      // for grouping
        dateLabel:`${day} ${months[mon-1]} ${year}`,              // "06 May 2024"
        timeLabel:`${hh}:${mm}:${ss} UTC`,                        // "01:23:45 UTC"
        scanLabel:`${hh}:${mm} UTC`,                              // short for list
      };
    }
    return { icao, dateKey: 'Unknown', dateLabel: 'Unknown Date', timeLabel: '', scanLabel: filename };
  }

  function renderLocalFiles(files) {
    const container = $('local-file-list');
    container.innerHTML = '';

    // Apply event filter
    let filteredFiles = files;
    if (state.activeFilter !== 'all') {
      const eventNames = getEventFileNames(state.activeFilter);
      filteredFiles = files.filter(f => eventNames.has(f.name));
    }

    if (!filteredFiles.length) {
      const msg = state.activeFilter !== 'all'
        ? 'No cached files for this event.<br>Use FETCH tab to download.'
        : 'No cached files.<br>Download from FETCH tab.';
      container.innerHTML = `<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:16px">${msg}</div>`;
      return;
    }

    // Group files by site then by date
    const groups = {}; // { KTLX: { '2024-05-06': [files...] } }
    filteredFiles.forEach(f => {
      const meta = parseFileMeta(f.name);
      if (!groups[meta.icao]) groups[meta.icao] = {};
      if (!groups[meta.icao][meta.dateKey]) groups[meta.icao][meta.dateKey] = [];
      groups[meta.icao][meta.dateKey].push({ ...f, meta });
    });

    // Render site → date → scan hierarchy
    Object.keys(groups).sort().forEach(icao => {
      // Site header
      const siteHeader = document.createElement('div');
      siteHeader.className = 'file-group-site';
      const siteInfo = NEXRAD_SITES.find(s => s.icao === icao);
      const siteName = siteInfo ? `${icao} — ${siteInfo.name}, ${siteInfo.state}` : icao;
      siteHeader.innerHTML = `<span class="file-group-site-icon">◈</span><span>${siteName}</span>`;
      container.appendChild(siteHeader);

      const dateMap = groups[icao];
      Object.keys(dateMap).sort().reverse().forEach(dateKey => {
        const dayFiles = dateMap[dateKey];
        const dateLabel = dayFiles[0].meta.dateLabel;

        // Date sub-header with scan count
        const dateHeader = document.createElement('div');
        dateHeader.className = 'file-group-date';
        dateHeader.innerHTML = `
          <span class="file-group-date-label">${dateLabel}</span>
          <span class="file-group-date-count">${dayFiles.length} scan${dayFiles.length !== 1 ? 's' : ''}</span>`;

        // Collapsible scan list
        const scanList = document.createElement('div');
        scanList.className = 'file-scan-list';
        let collapsed = false;

        dateHeader.addEventListener('click', () => {
          collapsed = !collapsed;
          scanList.style.display = collapsed ? 'none' : 'flex';
          dateHeader.classList.toggle('collapsed', collapsed);
        });

        dayFiles.sort((a, b) => a.meta.timeLabel.localeCompare(b.meta.timeLabel)).forEach(f => {
          const sizeMB = (f.size / 1024 / 1024).toFixed(1);
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
            loadRadarFile(f.name, f.meta.icao);
          });
          item.querySelector('.delete').addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm(`Delete ${f.meta.dateLabel} ${f.meta.timeLabel}?`)) return;
            try {
              await fetch(`${API}/local-files/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
              toast(`Deleted scan`, 'info');
              loadLocalFiles();
            } catch (err) { toast('Delete failed', 'error'); }
          });

          scanList.appendChild(item);
        });

        container.appendChild(dateHeader);
        container.appendChild(scanList);
      });
    });
  }

  async function loadRadarFile(filename, siteIcao) {
    setLoading(true, `Parsing ${filename}...`);
    try {
      const res = await fetch(`${API}/radar/parse?file=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      state.radarData = data;
      state.activeFile = filename;

      // Get site coordinates — prefer header ICAO, then passed siteIcao, then parse filename
      const icao = (data.header?.icao && data.header.icao !== 'UNKN')
        ? data.header.icao
        : (siteIcao || extractIcaoFromFilename(filename));
      const coords = getSiteCoords(icao);
      console.log('[App] Site ICAO:', icao, '| coords:', coords);
      state.activeSite = { icao, ...coords };

      state.availableMoments = new Set();
      data.elevations.forEach(e => Object.keys(e.data).forEach(k => state.availableMoments.add(k)));

      // Load into Cesium renderer with site coordinates
      Radar3D.loadRadarData(data, coords.lat, coords.lon);

      updateMomentButtons();
      buildElevationList();
      updatePointCount();
      renderLocalFiles(state.localFiles);

      $('radar-id-display').textContent = icao.toUpperCase();

      let timeStr = '';
      if (data.header?.scan_date && data.header?.scan_time) {
        try {
          const epoch = (data.header.scan_date - 1) * 86400 * 1000 + data.header.scan_time;
          const d = new Date(epoch);
          // Format: "Mon 21 Apr 2025  02:34:51 UTC"
          const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const pad = n => String(n).padStart(2, '0');
          timeStr = `${days[d.getUTCDay()]} ${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}  ` +
                    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
        } catch (_) { timeStr = filename; }
      } else {
        // Fall back to parsing datetime from filename e.g. KTLX20240506_012345_V06
        const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (m) {
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          timeStr = `${m[3]} ${months[parseInt(m[2])-1]} ${m[1]}  ${m[4]}:${m[5]}:${m[6]} UTC`;
        } else { timeStr = filename; }
      }
      $('radar-time-display').textContent = timeStr;

      // Build scan navigation list for this site
      buildScanList(filename, icao);

      $('empty-state').classList.add('hidden');
      switchTab('display');

      // Update colorbar — but only rebuild filter controls if moment changed
      const activeMoment = state.availableMoments.has(Radar3D.currentMoment)
        ? Radar3D.currentMoment
        : [...state.availableMoments][0] || 'reflectivity';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            // Always update the colorbar and description
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

  // ── Scan navigation ──────────────────────────────────────────────────────
  function buildScanList(activeFilename, siteIcao) {
    // Collect all local files for this site, sorted by datetime
    const siteFiles = state.localFiles
      .filter(f => {
        const icao = extractIcaoFromFilename(f.name);
        return icao === siteIcao.toUpperCase();
      })
      .sort((a, b) => {
        // Sort by the datetime embedded in the filename
        const ma = a.name.match(/(\d{8}_\d{6})/);
        const mb = b.name.match(/(\d{8}_\d{6})/);
        if (ma && mb) return ma[1].localeCompare(mb[1]);
        return a.name.localeCompare(b.name);
      });

    state.siteScans = siteFiles;
    state.scanIndex = siteFiles.findIndex(f => f.name === activeFilename);
    updateScanNav();
  }

  function updateScanNav() {
    const nav      = $('scan-nav');
    const prevBtn  = $('scan-prev-btn');
    const nextBtn  = $('scan-next-btn');
    const prevLbl  = $('scan-prev-label');
    const nextLbl  = $('scan-next-label');
    const posLbl   = $('scan-nav-pos');

    const scans = state.siteScans;
    const idx   = state.scanIndex;

    if (!scans.length || idx < 0) {
      nav.style.display = 'none';
      return;
    }

    nav.style.display = 'flex';

    const total = scans.length;
    posLbl.textContent = `${idx + 1} / ${total}`;

    // Previous scan
    const hasPrev = idx > 0;
    prevBtn.disabled = !hasPrev;
    if (hasPrev) {
      const meta = parseFileMeta(scans[idx - 1].name);
      prevLbl.textContent = meta.scanLabel;
      prevLbl.title = `${meta.dateLabel} ${meta.timeLabel}`;
    } else {
      prevLbl.textContent = '—';
      prevLbl.title = '';
    }

    // Next scan
    const hasNext = idx < total - 1;
    nextBtn.disabled = !hasNext;
    if (hasNext) {
      const meta = parseFileMeta(scans[idx + 1].name);
      nextLbl.textContent = meta.scanLabel;
      nextLbl.title = `${meta.dateLabel} ${meta.timeLabel}`;
    } else {
      nextLbl.textContent = '—';
      nextLbl.title = '';
    }
  }

  function navigateScan(direction) {
    const newIdx = state.scanIndex + direction;
    if (newIdx < 0 || newIdx >= state.siteScans.length) return;
    const file = state.siteScans[newIdx];
    const icao = extractIcaoFromFilename(file.name);
    loadRadarFile(file.name, icao);
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
  }

  function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    $('list-btn').addEventListener('click', listS3Files);
    $('site-input').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
    $('site-input').addEventListener('keydown', e => { if (e.key === 'Enter') listS3Files(); });

    $('site-lookup-btn').addEventListener('click', () => {
      $('site-modal').style.display = 'flex'; $('site-search').focus();
    });
    $('site-search').addEventListener('input', e => buildSiteGrid(e.target.value));
    document.querySelector('.modal-close').addEventListener('click', () => { $('site-modal').style.display = 'none'; });
    document.querySelector('.modal-backdrop').addEventListener('click', () => { $('site-modal').style.display = 'none'; });

    // Moment buttons
    $('moment-buttons').addEventListener('click', e => {
      const btn = e.target.closest('.moment-btn');
      if (!btn || btn.disabled) return;
      const key = btn.dataset.moment;
      // Reset filters to defaults for new moment
      const info = MOMENT_INFO[key];
      if (info) {
        if (info.filterType === 'min')              Radar3D.setThreshold(info.filterDefault);
        if (info.filterType === 'exclude_near_zero') Radar3D.setVelocityFilter(0);
        if (info.filterType === 'range')             Radar3D.setRangeFilter(info.filterMin, info.filterMax);
      }
      Radar3D.setMoment(key);
      updateMomentButtons();
      updateColorbar(key);
      updatePointCount();
    });

    // Moment info panel toggle
    const infoPanel  = $('moment-info-panel');
    const infoToggle = $('moment-info-toggle');
    if (infoToggle) {
      infoToggle.addEventListener('click', () => {
        infoPanel.classList.toggle('collapsed');
      });
    }

    // Map style buttons
    document.querySelectorAll('.map-style-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-style-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Radar3D.setMapStyle(btn.dataset.style);
      });
    });

    // Display controls
    $('point-size').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      $('point-size-val').textContent = v;
      Radar3D.setPointSize(v);
    });
    $('opacity-range').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      $('opacity-val').textContent = v.toFixed(2);
      Radar3D.setOpacity(v);
    });
    $('height-scale').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      $('height-scale-val').textContent = v.toFixed(1);
      Radar3D.setHeightScale(v);
      updatePointCount();
    });
    // threshold is now in the moment info panel — no standalone slider
    $('show-rings').addEventListener('change', e => Radar3D.setShowRings(e.target.checked));
    $('animate-tilts').addEventListener('change', e => Radar3D.setShowAllElevations(e.target.checked));

    $('reset-camera-btn').addEventListener('click', () => Radar3D.resetCamera());
    $('scan-prev-btn').addEventListener('click', () => navigateScan(-1));
    $('scan-next-btn').addEventListener('click', () => navigateScan(+1));
    $('toggle-sidebar-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // Upload
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

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') Radar3D.resetCamera();
      if (e.key >= '1' && e.key <= '6') {
        const btns = document.querySelectorAll('.moment-btn');
        const idx = parseInt(e.key) - 1;
        if (btns[idx] && !btns[idx].disabled) btns[idx].click();
      }
    });
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('radarFile', file);
    setLoading(true, `Uploading ${file.name}...`);
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`Uploaded: ${data.file}`, 'success');
      loadLocalFiles();
      loadRadarFile(data.file, data.file.slice(0, 4));
    } catch (err) {
      toast('Upload failed: ' + err.message, 'error');
    } finally { setLoading(false); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();