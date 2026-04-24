/**
 * radar3d.js — Hybrid Cesium (globe) + Three.js (radar points) renderer
 * Zero-allocation inner loop: all coordinate math done inline with typed arrays
 */
window.Radar3D = (function () {

  const DEG2RAD = Math.PI / 180;
  const EARTH_R  = 6371000;
  // Token fetched from server at runtime — never hardcoded in source
  let CESIUM_TOKEN = '';

  // Hard limits — tune these if still slow
  const MAX_RANGE_KM       = 230;   // max radar range to render
  const MAX_PTS_PER_ELEV   = 300000;

  let cesiumViewer  = null;
  let threeRenderer = null;
  let threeScene    = null;
  let threeCamera   = null;

  let elevationMeshes    = {};
  let ringsMesh          = null;
  let radarData          = null;
  let radarLat = 0, radarLon = 0;

  // Geometry cache: filename -> { meshes: {idx->Points}, rings: LineSegments }
  // Keeps built geometry in memory so scan switching is instant.
  // Small — each entry holds one full scan's worth of GPU geometry.
  const MAX_GEOM_CACHE   = 6;
  const geometryCache    = new Map();
  let   activeFilename   = null;

  let currentMoment     = 'reflectivity';
  let currentElevations = new Set([0]);
  let showAllElevs      = false;
  let pointSize         = 4;
  let opacity           = 0.9;
  let heightScale       = 1.0;
  let threshold         = -30;
  let showRings         = true;
  let building          = false;
  let _prebuildAborted  = false;
  // Extended filter state
  let velocityFilter    = 0;    // exclude ±N m/s around zero
  let rangeFilterLow    = -999; // keep values >= this
  let rangeFilterHigh   = 9999; // keep values <= this

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init(containerId) {
    // Fetch token from server before initializing Cesium
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      CESIUM_TOKEN = cfg.cesiumToken || '';
      if (!CESIUM_TOKEN) {
        console.error('[Radar3D] No Cesium token found. Copy config.template.json to config.json and add your token.');
      }
    } catch (e) {
      console.error('[Radar3D] Could not fetch config from server:', e);
    }

    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;

    cesiumViewer = new Cesium.Viewer(containerId, {
      imageryProvider:      false,
      terrainProvider:      new Cesium.EllipsoidTerrainProvider(),
      baseLayerPicker:      false,
      geocoder:             false,
      homeButton:           false,
      sceneModePicker:      false,
      navigationHelpButton: false,
      animation:            false,
      timeline:             false,
      fullscreenButton:     false,
      infoBox:              false,
      selectionIndicator:   false,
      shadows:              false,
    });

    cesiumViewer.scene.globe.enableLighting        = false;
    cesiumViewer.scene.globe.depthTestAgainstTerrain = false;
    cesiumViewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#090c10');

    // Terrain best-effort
    try {
      if (Cesium.CesiumTerrainProvider && Cesium.CesiumTerrainProvider.fromIonAssetId) {
        Cesium.CesiumTerrainProvider.fromIonAssetId(1)
          .then(tp => { cesiumViewer.terrainProvider = tp; }).catch(() => {});
      } else if (Cesium.createWorldTerrain) {
        cesiumViewer.terrainProvider = Cesium.createWorldTerrain();
      }
    } catch (e) {}

    setMapStyle('satellite');

    // First load: top-down view of CONUS. After that, camera stays where user left it.
    const hasVisited = sessionStorage.getItem('nexrad3d_visited');
    if (!hasVisited) {
      sessionStorage.setItem('nexrad3d_visited', '1');
      cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-96.0, 38.5, 4800000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });
    }

    // Three.js overlay canvas
    const container    = document.getElementById(containerId);
    const cesiumCanvas = cesiumViewer.scene.canvas;
    const threeCanvas  = document.createElement('canvas');
    threeCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(threeCanvas);

    threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: false });
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    threeRenderer.setClearColor(0x000000, 0);
    threeRenderer.autoClear = false;  // don't clear — Cesium drew the globe underneath

    threeScene  = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(60, 1, 1, 1e12);
    threeCamera.matrixAutoUpdate = false;  // we set the matrix manually from Cesium
    threeScene.matrixAutoUpdate  = false;

    cesiumViewer.scene.postRender.addEventListener(syncRender);
    window.addEventListener('resize', onResize);
    onResize();

    console.log('[Radar3D] Initialized');
  }

  // ── Camera sync (runs every Cesium frame) ─────────────────────────────────
  function syncRender() {
    if (!threeRenderer || !cesiumViewer) return;
    const cc = cesiumViewer.scene.canvas;
    const cam = cesiumViewer.camera;

    let fov = 60;
    try { fov = Cesium.Math.toDegrees(cam.frustum.fovy || cam.frustum._fovy || 1.0); } catch(e) {}

    threeCamera.fov    = fov;
    threeCamera.aspect = cc.clientWidth / cc.clientHeight;
    threeCamera.near   = Math.max(1, cam.frustum.near || 1);
    threeCamera.far    = cam.frustum.far  || 1e12;
    threeCamera.updateProjectionMatrix();

    // Cesium viewMatrix is column-major: index [col*4+row]
    // Three.js Matrix4.set() takes row-major arguments
    const m = cam.viewMatrix;
    threeCamera.matrixWorldInverse.set(
      m[0], m[4], m[8],  m[12],
      m[1], m[5], m[9],  m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15]
    );
    threeCamera.matrixWorld.copy(threeCamera.matrixWorldInverse).invert();
    // matrixAutoUpdate=false so Three.js won't overwrite these

    threeRenderer.resetState();
    threeRenderer.clearDepth(); // clear depth so points aren't occluded by Cesium's depth buffer
    threeRenderer.render(threeScene, threeCamera);
  }

  function onResize() {
    if (!cesiumViewer || !threeRenderer) return;
    const c = cesiumViewer.scene.canvas;
    threeRenderer.setSize(c.clientWidth, c.clientHeight, false);
    if (threeCamera) {
      threeCamera.aspect = c.clientWidth / c.clientHeight;
      threeCamera.updateProjectionMatrix();
    }
  }

  // ── Map style ─────────────────────────────────────────────────────────────
  function setMapStyle(styleName) {
    if (!cesiumViewer) return;
    const layers = cesiumViewer.imageryLayers;
    layers.removeAll();
    const safe = fn => { try { fn(); } catch(e) { console.warn('imagery:', e.message); } };

    if (styleName === 'satellite') {
      if (Cesium.IonImageryProvider.fromAssetId) {
        Cesium.IonImageryProvider.fromAssetId(2)
          .then(p => { layers.removeAll(); layers.addImageryProvider(p); })
          .catch(() => safe(() => layers.addImageryProvider(
            new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }))));
      } else {
        safe(() => layers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 2 })));
      }
    } else if (styleName === 'street') {
      safe(() => layers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })));
    } else if (styleName === 'terrain') {
      safe(() => layers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        credit: 'Esri',
      })));
    } else if (styleName === 'dark') {
      safe(() => layers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png',
        credit: 'Stadia Maps', maximumLevel: 20,
      })));
    }
  }

  // ── ECEF conversion — pure math, zero object allocation ──────────────────
  // Converts geodetic (lat°, lon°, alt m) → ECEF XYZ meters inline
  // WGS84 ellipsoid
  const WGS84_A  = 6378137.0;
  const WGS84_E2 = 0.00669437999014;

  function latLonAltToECEF(latDeg, lonDeg, altM, out) {
    const lat  = latDeg * DEG2RAD;
    const lon  = lonDeg * DEG2RAD;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    out[0] = (N + altM) * cosLat * cosLon;  // X
    out[1] = (N + altM) * cosLat * sinLon;  // Y
    out[2] = (N * (1 - WGS84_E2) + altM) * sinLat; // Z
  }

  // ── Build one elevation's mesh — no allocations in hot loop ──────────────
  function buildElevationMesh(elevData, elevIdx) {
    const momentData = elevData.data[currentMoment];
    if (!momentData || !momentData.length) return null;
    const cm = RadarColormaps.MAPS[currentMoment];
    if (!cm) return null;

    const numScans   = momentData.length;
    const elevAngle  = (elevData.elevationAngle || 0) * DEG2RAD;
    const azimuths   = elevData.azimuths || [];

    // Pre-allocate max-size typed arrays — NO dynamic growth
    const posArr = new Float32Array(MAX_PTS_PER_ELEV * 3);
    const colArr = new Float32Array(MAX_PTS_PER_ELEV * 3);
    let   count  = 0;

    const cosElev = Math.cos(elevAngle);
    const sinElev = Math.sin(elevAngle);

    // Radar site ECEF — compute once
    const siteECEF = new Float64Array(3);
    latLonAltToECEF(radarLat, radarLon, 0, siteECEF);

    // ENU basis vectors at radar site (for dx/dy → ECEF offset)
    const latR   = radarLat * DEG2RAD;
    const lonR   = radarLon * DEG2RAD;
    const sinLatS = Math.sin(latR), cosLatS = Math.cos(latR);
    const sinLonS = Math.sin(lonR), cosLonS = Math.cos(lonR);
    // East unit vector: (-sinLon, cosLon, 0)
    const eE_x = -sinLonS, eE_y = cosLonS, eE_z = 0;
    // North unit vector: (-sinLat*cosLon, -sinLat*sinLon, cosLat)
    const eN_x = -sinLatS * cosLonS, eN_y = -sinLatS * sinLonS, eN_z = cosLatS;
    // Up unit vector: (cosLat*cosLon, cosLat*sinLon, sinLat)
    const eU_x = cosLatS * cosLonS,  eU_y = cosLatS * sinLonS,  eU_z = sinLatS;

    const tmp = new Float64Array(3); // reuse for each point

    let skipped = 0;

    for (let scan = 0; scan < numScans; scan++) {
      if (count >= MAX_PTS_PER_ELEV) break;

      const azDeg  = azimuths[scan] !== undefined ? azimuths[scan] : (scan * 360 / numScans);
      const azRad  = azDeg * DEG2RAD;
      const sinAz  = Math.sin(azRad);
      const cosAz  = Math.cos(azRad);
      const scanObj = momentData[scan];
      if (!scanObj) continue;

      let gates, gateKm, firstKm;
      if (scanObj.moment_data !== undefined) {
        gates   = scanObj.moment_data;
        gateKm  = scanObj.gate_size  || 0.25;
        firstKm = scanObj.first_gate || 2.125;
      } else if (Array.isArray(scanObj)) {
        gates = scanObj; gateKm = 0.25; firstKm = 2.125;
      } else if (scanObj.data !== undefined) {
        gates   = scanObj.data;
        const gs = scanObj.gate_size  || 250;
        const fg = scanObj.first_gate || 2125;
        gateKm  = gs > 10 ? gs / 1000 : gs;
        firstKm = fg > 10 ? fg / 1000 : fg;
      } else continue;

      if (!gates || !gates.length) continue;

      const maxG = Math.min(gates.length, Math.ceil(MAX_RANGE_KM / gateKm));

      for (let g = 0; g < maxG; g++) {
        if (count >= MAX_PTS_PER_ELEV) break;

        const val = gates[g];
        if (val === null || val === undefined || val !== val) { skipped++; continue; }
        // Apply moment-appropriate filter
        if (velocityFilter > 0 && Math.abs(val) < velocityFilter) { skipped++; continue; }
        if (rangeFilterLow > -999 && val < rangeFilterLow)         { skipped++; continue; }
        if (rangeFilterHigh < 9999 && val > rangeFilterHigh)       { skipped++; continue; }
        if (velocityFilter === 0 && rangeFilterLow <= -999 && val < threshold) { skipped++; continue; }

        const rangeM    = (firstKm + g * gateKm) * 1000;
        const groundRng = rangeM * cosElev;
        const heightM   = rangeM * sinElev
                        + (groundRng * groundRng) / (2 * EARTH_R);

        // ENU displacement in meters
        const east  = groundRng * sinAz;
        const north = groundRng * cosAz;
        const up    = heightM * heightScale;

        // ECEF = siteECEF + east*eE + north*eN + up*eU
        const px = siteECEF[0] + east * eE_x + north * eN_x + up * eU_x;
        const py = siteECEF[1] + east * eE_y + north * eN_y + up * eU_y;
        const pz = siteECEF[2] + east * eE_z + north * eN_z + up * eU_z;

        const i3 = count * 3;
        posArr[i3]   = px;
        posArr[i3+1] = py;
        posArr[i3+2] = pz;

        const rgb = RadarColormaps.getRGB(currentMoment, val);
        colArr[i3]   = rgb[0];
        colArr[i3+1] = rgb[1];
        colArr[i3+2] = rgb[2];

        count++;
      }
    }

    if (elevIdx === 0) {
      console.log('[Radar3D] Elev 0 — kept:', count, 'skipped:', skipped,
        '| first_gate:', momentData[0]?.first_gate,
        '| gate_size:', momentData[0]?.gate_size,
        '| threshold:', threshold);
      if (count > 0) {
        // Log first point ECEF and back-converted to verify math
        const x = posArr[0], y = posArr[1], z = posArr[2];
        const r = Math.sqrt(x*x + y*y + z*z);
        console.log('[Radar3D] First point ECEF:', x.toFixed(0), y.toFixed(0), z.toFixed(0));
        console.log('[Radar3D] Distance from Earth center (should be ~6371000-6500000m):', r.toFixed(0));
        // Verify camera can see it — log Cesium cartographic
        try {
          const cart = Cesium.Cartographic.fromCartesian(new Cesium.Cartesian3(x, y, z));
          console.log('[Radar3D] Back to lat/lon/alt:',
            Cesium.Math.toDegrees(cart.latitude).toFixed(3),
            Cesium.Math.toDegrees(cart.longitude).toFixed(3),
            cart.height.toFixed(0) + 'm');
        } catch(e) {}
      }
    }

    if (count === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr.subarray(0, count * 3), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colArr.subarray(0, count * 3), 3));

    const mat = new THREE.PointsMaterial({
      size:            pointSize,
      vertexColors:    true,
      transparent:     true,
      opacity,
      sizeAttenuation: false,
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.userData.elevIdx = elevIdx;
    return mesh;
  }

  // ── Range rings ───────────────────────────────────────────────────────────
  function buildRangeRings() {
    if (ringsMesh) { threeScene.remove(ringsMesh); ringsMesh.geometry.dispose(); ringsMesh = null; }
    if (!showRings || !radarData) return;

    const rings = [50, 100, 150, 200, 300, 460];
    const segs  = 128;
    const tmp   = new Float64Array(3);
    const verts = [];

    rings.forEach(rkm => {
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const gr = rkm * 1000;
        latLonAltToECEF(
          radarLat + (gr * Math.cos(a) / EARTH_R) * (180 / Math.PI),
          radarLon + (gr * Math.sin(a) / (EARTH_R * Math.cos(radarLat * DEG2RAD))) * (180 / Math.PI),
          200, tmp
        );
        verts.push(tmp[0], tmp[1], tmp[2]);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    ringsMesh = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ color: 0x1e6080, transparent: true, opacity: 0.5 }));
    threeScene.add(ringsMesh);
  }

  // ── Scene management ──────────────────────────────────────────────────────
  function clearScene() {
    Object.values(elevationMeshes).forEach(m => {
      threeScene.remove(m); m.geometry.dispose(); m.material.dispose();
    });
    elevationMeshes = {};
    if (ringsMesh) { threeScene.remove(ringsMesh); ringsMesh.geometry.dispose(); ringsMesh = null; }
  }

  // Async build — yields between elevations so browser stays responsive
  async function loadRadarData(data, siteLat, siteLon, filename) {
    if (building) return;

    // If we have cached geometry for this file+moment+settings, swap instantly
    if (filename && geometryCache.has(filename)) {
      const cached = geometryCache.get(filename);
      cached.lastUsed = Date.now();

      // Only use cache if moment and key settings match
      if (cached.moment === currentMoment &&
          cached.heightScale === heightScale &&
          cached.threshold === threshold &&
          cached.velocityFilter === velocityFilter &&
          cached.rangeFilterLow === rangeFilterLow &&
          cached.rangeFilterHigh === rangeFilterHigh) {

        console.log('[Radar3D] Geometry cache hit:', filename);

        // Remove current meshes from scene (but keep in their own cache entry)
        Object.values(elevationMeshes).forEach(m => threeScene.remove(m));
        if (ringsMesh) { threeScene.remove(ringsMesh); ringsMesh = null; }

        // Swap in cached meshes
        elevationMeshes = cached.meshes;
        ringsMesh       = cached.rings || null;
        radarData       = data;
        radarLat        = siteLat || 0;
        radarLon        = siteLon || 0;
        activeFilename  = filename;
        cached.lastUsed = Date.now();

        // Update elevation selection to match new scan's angles
        const lowestIdx = data.elevations.reduce((best, elev, idx) =>
          (elev.elevationAngle || 0) < (data.elevations[best].elevationAngle || 0) ? idx : best, 0);

        const prevAngles = [...currentElevations]
          .map(i => radarData && radarData.elevations[i] ? radarData.elevations[i].elevationAngle : null)
          .filter(a => a !== null);

        if (prevAngles.length > 0 && !showAllElevs) {
          const newSet = new Set();
          prevAngles.forEach(prevAngle => {
            let bestIdx = -1, bestDiff = Infinity;
            data.elevations.forEach((elev, idx) => {
              const diff = Math.abs((elev.elevationAngle || 0) - prevAngle);
              if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
            });
            if (bestIdx >= 0 && bestDiff < 0.5) newSet.add(bestIdx);
          });
          if (newSet.size > 0) currentElevations = newSet;
        }

        // Add cached meshes to scene with correct visibility
        Object.entries(elevationMeshes).forEach(([i, m]) => {
          m.visible = showAllElevs || currentElevations.has(Number(i));
          threeScene.add(m);
        });
        if (ringsMesh) threeScene.add(ringsMesh);

        const availMoments = new Set();
        data.elevations.forEach(e => Object.keys(e.data).forEach(k => availMoments.add(k)));
        return availMoments;
      }
    }

    radarData = data; radarLat = siteLat || 0; radarLon = siteLon || 0;
    activeFilename = filename || null;
    clearScene();

    if (!data || !data.elevations || !data.elevations.length) return;

    const availMoments = new Set();
    data.elevations.forEach(e => Object.keys(e.data).forEach(k => availMoments.add(k)));
    console.log('[Radar3D] Moments:', [...availMoments], '| Elevs:', data.elevations.length);

    // ── Preserve user settings across scan loads ─────────────────────────
    // Moment: keep current if available in new scan, else pick first available
    if (!availMoments.has(currentMoment)) {
      currentMoment = [...availMoments][0] || 'reflectivity';
    }

    // Helper: index of lowest elevation angle
    const lowestIdx = data.elevations.reduce((best, elev, idx) => {
      return (elev.elevationAngle || 0) < (data.elevations[best].elevationAngle || 0) ? idx : best;
    }, 0);

    // Elevations: match previously selected angles by value (±0.5°) in new scan
    // so stepping between scans keeps the same physical tilt selected
    const prevAngles = [...currentElevations]
      .map(i => radarData && radarData.elevations[i] ? radarData.elevations[i].elevationAngle : null)
      .filter(a => a !== null);

    if (prevAngles.length > 0 && !showAllElevs) {
      const newSet = new Set();
      prevAngles.forEach(prevAngle => {
        let bestIdx = -1, bestDiff = Infinity;
        data.elevations.forEach((elev, idx) => {
          const diff = Math.abs((elev.elevationAngle || 0) - prevAngle);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
        });
        if (bestIdx >= 0 && bestDiff < 0.5) newSet.add(bestIdx);
      });
      currentElevations = newSet.size > 0 ? newSet : new Set([lowestIdx]);
    } else if (!showAllElevs) {
      // First load — default to lowest angle
      currentElevations = new Set([lowestIdx]);
    }
    // If showAllElevs is true, leave it — all tilts will show for new scan too

    building = true;
    try {
      for (let idx = 0; idx < data.elevations.length; idx++) {
        const mesh = buildElevationMesh(data.elevations[idx], idx);
        if (mesh) {
          elevationMeshes[idx] = mesh;
          mesh.visible = showAllElevs || currentElevations.has(idx);
          threeScene.add(mesh);
        }
        await new Promise(r => setTimeout(r, 0)); // yield to browser
      }
    } finally { building = false; }

    if (showRings) buildRangeRings();
    console.log('[Radar3D] Done. Points:', getTotalPoints());

    // Save built geometry to cache (parseData stored so callers can skip re-fetch)
    if (activeFilename) {
      evictOldestGeometry();
      geometryCache.set(activeFilename, {
        meshes:          { ...elevationMeshes },
        rings:           ringsMesh,
        parseData:       data,
        moment:          currentMoment,
        heightScale,
        threshold,
        velocityFilter,
        rangeFilterLow,
        rangeFilterHigh,
        lastUsed:        Date.now(),
      });
      console.log('[Radar3D] Cached geometry for:', activeFilename, '| Cache size:', geometryCache.size);
    }

    return availMoments;
  }

  // Dispose all pre-built (non-active) geometry and clear the cache.
  // Call this when switching radar sites so stale GPU buffers are freed immediately.
  function clearGeometryCache() {
    geometryCache.forEach((entry, filename) => {
      if (filename === activeFilename) return; // active meshes are owned by elevationMeshes; clearScene() handles them
      Object.values(entry.meshes).forEach(m => {
        threeScene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      if (entry.rings) { threeScene.remove(entry.rings); entry.rings.geometry.dispose(); }
    });
    geometryCache.clear();
    console.log('[Radar3D] Geometry cache cleared');
  }

  function evictOldestGeometry() {
    if (geometryCache.size < MAX_GEOM_CACHE) return;
    let oldest = null, oldestTime = Infinity;
    geometryCache.forEach((v, k) => {
      if (k !== activeFilename && v.lastUsed < oldestTime) {
        oldest = k; oldestTime = v.lastUsed;
      }
    });
    if (oldest) {
      const entry = geometryCache.get(oldest);
      // Remove from scene if somehow still there, then dispose GPU resources
      Object.values(entry.meshes).forEach(m => {
        threeScene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      if (entry.rings) { threeScene.remove(entry.rings); entry.rings.geometry.dispose(); }
      geometryCache.delete(oldest);
      console.log('[Radar3D] Evicted geometry cache for:', oldest);
    }
  }

  // Pre-build geometry for a list of {data, filename, siteLat, siteLon} objects.
  // onScanBuilt(filename) is called after each scan is cached — use it to refresh UI.
  async function prebuildScans(scanList, onScanBuilt) {
    _prebuildAborted = false;
    for (const scan of scanList) {
      if (_prebuildAborted) { console.log('[Radar3D] Prebuild aborted'); return; }
      if (building) { await new Promise(r => setTimeout(r, 100)); continue; }
      if (geometryCache.has(scan.filename)) continue; // already built

      console.log('[Radar3D] Pre-building geometry for:', scan.filename);
      const prevFilename = activeFilename;
      const prevData     = radarData;
      const prevLat      = radarLat;
      const prevLon      = radarLon;

      // Build in background without changing the active scene
      activeFilename = scan.filename;
      radarData = scan.data;
      radarLat  = scan.siteLat;
      radarLon  = scan.siteLon;

      const tempMeshes = {};
      building = true;
      try {
        for (let idx = 0; idx < scan.data.elevations.length; idx++) {
          if (_prebuildAborted) break;
          const mesh = buildElevationMesh(scan.data.elevations[idx], idx);
          if (mesh) {
            mesh.visible = false;
            tempMeshes[idx] = mesh;
            // DO NOT add to scene — keep off-scene until actually needed
          }
          await new Promise(r => setTimeout(r, 0));
        }
      } finally { building = false; }

      if (_prebuildAborted) {
        Object.values(tempMeshes).forEach(m => { m.geometry.dispose(); m.material.dispose(); });
        return;
      }

      // Save to cache (parseData stored so callers can skip re-fetch)
      evictOldestGeometry();
      geometryCache.set(scan.filename, {
        meshes: tempMeshes, rings: null,
        parseData: scan.data,
        moment: currentMoment, heightScale, threshold,
        velocityFilter, rangeFilterLow, rangeFilterHigh,
        lastUsed: Date.now(),
      });

      // Restore active state
      activeFilename = prevFilename;
      radarData      = prevData;
      radarLat       = prevLat;
      radarLon       = prevLon;

      console.log('[Radar3D] Pre-built:', scan.filename);
      if (onScanBuilt) onScanBuilt(scan.filename);
    }
  }

  async function rebuildPointClouds() {
    if (building || !radarData) return;
    Object.values(elevationMeshes).forEach(m => {
      threeScene.remove(m); m.geometry.dispose(); m.material.dispose();
    });
    elevationMeshes = {};
    building = true;
    try {
      for (let idx = 0; idx < radarData.elevations.length; idx++) {
        const mesh = buildElevationMesh(radarData.elevations[idx], idx);
        if (mesh) {
          elevationMeshes[idx] = mesh;
          mesh.visible = showAllElevs || currentElevations.has(idx);
          threeScene.add(mesh);
        }
        await new Promise(r => setTimeout(r, 0));
      }
    } finally { building = false; }
    console.log('[Radar3D] Rebuilt. Points:', getTotalPoints());
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  function flyToRadar() {
    if (!cesiumViewer || !radarLat) return;
    cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(radarLon, radarLat - 0.8, 300000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-28), roll: 0 },
      duration: 2.0,
    });
  }
  function resetCamera() { flyToRadar(); }

  // ── Setters ───────────────────────────────────────────────────────────────
  function setMoment(key)  {
    currentMoment   = key;
    velocityFilter  = 0;
    rangeFilterLow  = -999;
    rangeFilterHigh = 9999;
    threshold       = -30;
    geometryCache.clear(); // settings changed — invalidate all cached geometry
    rebuildPointClouds();
  }
  function setHeightScale(s) { heightScale = s; geometryCache.clear(); rebuildPointClouds(); }
  function setThreshold(t)   { threshold = t;   geometryCache.clear(); rebuildPointClouds(); }

  function setElevation(idx, exclusive = false) {
    if (exclusive) { currentElevations = new Set([idx]); showAllElevs = false; }
    else {
      if (currentElevations.has(idx)) currentElevations.delete(idx);
      else currentElevations.add(idx);
    }
    Object.entries(elevationMeshes).forEach(([i, m]) => {
      m.visible = showAllElevs || currentElevations.has(Number(i));
    });
  }

  function setShowAllElevations(val) {
    showAllElevs = val;
    Object.entries(elevationMeshes).forEach(([i, m]) => {
      m.visible = val || currentElevations.has(Number(i));
    });
  }

  // Sync all mesh visibility to match currentElevations set directly
  function syncVisibility() {
    Object.entries(elevationMeshes).forEach(([i, m]) => {
      m.visible = showAllElevs || currentElevations.has(Number(i));
    });
  }

  function setPointSize(size) {
    pointSize = size;
    Object.values(elevationMeshes).forEach(m => {
      m.material.size = size; m.material.needsUpdate = true;
    });
  }

  function setOpacity(o) {
    opacity = o;
    Object.values(elevationMeshes).forEach(m => {
      m.material.opacity = o; m.material.needsUpdate = true;
    });
  }

  function setVelocityFilter(v) {
    velocityFilter = v;
    // Reset range filter when using velocity filter
    rangeFilterLow = -999; rangeFilterHigh = 9999;
    rebuildPointClouds();
  }

  function setRangeFilter(lo, hi) {
    rangeFilterLow  = lo;
    rangeFilterHigh = hi;
    velocityFilter  = 0;
    threshold       = -999; // range filter replaces threshold
    rebuildPointClouds();
  }

  function setShowRings(v) {
    showRings = v;
    if (!v && ringsMesh) { threeScene.remove(ringsMesh); ringsMesh.geometry.dispose(); ringsMesh = null; }
    else if (v && !ringsMesh && radarData) buildRangeRings();
  }

  function getTotalPoints() {
    let n = 0;
    Object.values(elevationMeshes).forEach(m => { if (m.visible) n += m.geometry.attributes.position.count; });
    return n;
  }

  return {
    init, loadRadarData, setMapStyle, prebuildScans,
    clearGeometryCache,
    abortPrebuild: () => { _prebuildAborted = true; },
    hasCachedGeometry:  filename => geometryCache.has(filename),
    getCachedParseData: filename => geometryCache.get(filename)?.parseData ?? null,
    setMoment, setElevation, setShowAllElevations, syncVisibility,
    setPointSize, setOpacity, setHeightScale, setThreshold,
    setVelocityFilter, setRangeFilter,
    setShowRings, resetCamera, getTotalPoints,
    get currentMoment()     { return currentMoment; },
    get currentElevations() { return currentElevations; },
    get showAllElevs()      { return showAllElevs; },
  };
})();