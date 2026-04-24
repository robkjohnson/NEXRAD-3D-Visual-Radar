import { $, updatePointCount } from '../utils.js';
import { state } from '../state.js';

export function buildElevationList() {
  const container = $('elevation-list');
  container.innerHTML = '';
  if (!state.radarData) return;

  const allBtn = document.createElement('div');
  allBtn.className = 'elev-all-toggle' + (window.Radar3D.showAllElevs ? ' active' : '');
  allBtn.textContent = 'ALL TILTS';
  allBtn.addEventListener('click', () => {
    const newVal = !window.Radar3D.showAllElevs;
    window.Radar3D.setShowAllElevations(newVal);
    allBtn.classList.toggle('active', newVal);
    document.querySelectorAll('.elev-item, .elev-sub-item').forEach(el => {
      el.classList.toggle('active', newVal);
    });
    document.querySelectorAll('.elev-submenu').forEach(sm => {
      sm.style.display = newVal ? 'flex' : 'none';
    });
    document.querySelectorAll('.elev-cuts-chevron').forEach(ch => {
      ch.textContent = newVal ? '⌄' : '›';
      ch.classList.toggle('open', newVal);
    });
    updatePointCount();
  });
  container.appendChild(allBtn);

  // Group elevations by rounded angle — NEXRAD may scan the same angle multiple times
  // with different moments (e.g. REF vs VEL). Group so the user sees one entry per angle.
  const angleGroups = {};
  state.radarData.elevations.forEach((elev, idx) => {
    const angleKey = (elev.elevationAngle || 0).toFixed(2);
    if (!angleGroups[angleKey]) angleGroups[angleKey] = [];
    angleGroups[angleKey].push({ elev, idx });
  });

  const sortedGroups = Object.entries(angleGroups)
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

  const momentOrder = ['reflectivity','velocity','spectrum','zdr','phi','rho'];
  const momentShort = { reflectivity:'REF', velocity:'VEL', spectrum:'SW', zdr:'ZDR', phi:'PHI', rho:'RHO' };

  function cutLabel(entryMoments, allEntriesAtAngle) {
    const keys = Object.keys(entryMoments);
    if (allEntriesAtAngle.length === 1) return null;

    const hasVel     = keys.includes('velocity');
    const hasRef     = keys.includes('reflectivity');
    const hasZdr     = keys.includes('zdr');
    const hasPhi     = keys.includes('phi');
    const hasRho     = keys.includes('rho');
    const hasDualPol = hasZdr || hasPhi || hasRho;

    console.log('[CutLabel] keys:', keys, '| hasRef:', hasRef, '| hasVel:', hasVel, '| hasDualPol:', hasDualPol);

    if (hasRef && !hasVel && !hasDualPol) return 'Long Range REF';
    if (hasRef && !hasVel && hasDualPol)  return 'REF + Dual-Pol';
    if (hasVel && hasDualPol)             return 'Vel + Dual-Pol';
    if (hasVel && !hasDualPol && hasRef)  return 'REF + Velocity';
    if (hasVel && !hasDualPol && !hasRef) return 'Velocity Only';
    if (hasDualPol && !hasVel)            return 'Dual-Pol';

    const cutIdx = allEntriesAtAngle.findIndex(
      e => Object.keys(e.elev.data).sort().join() === keys.sort().join()
    );
    return `Cut ${cutIdx + 1}`;
  }

  function makeToggleHandler(idx, itemEl) {
    return () => {
      if (window.Radar3D.showAllElevs) {
        state.radarData.elevations.forEach((_, i) => window.Radar3D.currentElevations.add(i));
        window.Radar3D.setShowAllElevations(false);
        allBtn.classList.remove('active');
        document.querySelectorAll('.elev-item, .elev-sub-item').forEach(el => el.classList.add('active'));
      }
      const nowActive = window.Radar3D.currentElevations.has(idx);
      if (nowActive) {
        window.Radar3D.currentElevations.delete(idx);
      } else {
        window.Radar3D.currentElevations.add(idx);
      }
      window.Radar3D.syncVisibility();
      itemEl.classList.toggle('active', !nowActive);
      updatePointCount();
    };
  }

  sortedGroups.forEach(([angleKey, entries]) => {
    if (entries.length === 1) {
      // ── Single cut — simple row ──────────────────────────────────────────
      const { elev, idx } = entries[0];
      const keys = Object.keys(elev.data);
      const tags = momentOrder.filter(k => keys.includes(k))
        .map(k => `<span class="moment-tag">${momentShort[k]}</span>`).join('');
      const isActive = window.Radar3D.currentElevations.has(idx) || window.Radar3D.showAllElevs;

      const item = document.createElement('div');
      item.className = 'elev-item' + (isActive ? ' active' : '');
      item.innerHTML = `
        <span class="elev-angle">${angleKey}°</span>
        <span class="elev-moments">${tags}</span>`;
      item.addEventListener('click', makeToggleHandler(idx, item));
      container.appendChild(item);

    } else {
      // ── Multiple cuts — clickable angle row + collapsible sub-menu ───────
      const firstIdx  = entries[0].idx;
      const firstKeys = Object.keys(entries[0].elev.data);
      const firstTags = momentOrder.filter(k => firstKeys.includes(k))
        .map(k => `<span class="moment-tag">${momentShort[k]}</span>`).join('');

      const anyActive  = entries.some(({ idx }) => window.Radar3D.currentElevations.has(idx)) || window.Radar3D.showAllElevs;
      const allIndices = entries.map(e => e.idx);

      const wrapper = document.createElement('div');
      wrapper.className = 'elev-group-wrapper';

      const mainRow = document.createElement('div');
      mainRow.className = 'elev-item elev-item-multicut' + (anyActive ? ' active' : '');
      mainRow.innerHTML = `
        <span class="elev-angle">${angleKey}°</span>
        <span class="elev-moments">${firstTags}</span>
        <span class="elev-cuts-chevron" title="Show cuts">›</span>`;
      wrapper.appendChild(mainRow);

      const subMenu = document.createElement('div');
      subMenu.className = 'elev-submenu';
      subMenu.style.display = 'none';

      entries.forEach(({ elev, idx }, cutI) => {
        const keys  = Object.keys(elev.data);
        const tags  = momentOrder.filter(k => keys.includes(k))
          .map(k => `<span class="moment-tag">${momentShort[k]}</span>`).join('');
        const label = cutLabel(elev.data, entries) || `Cut ${cutI + 1}`;
        const isActive = window.Radar3D.currentElevations.has(idx) || window.Radar3D.showAllElevs;

        const sub = document.createElement('div');
        sub.className = 'elev-sub-item' + (isActive ? ' active' : '');
        sub.innerHTML = `
          <span class="elev-sub-label">${label}</span>
          <span class="elev-moments">${tags}</span>`;

        sub.addEventListener('click', e => {
          e.stopPropagation();
          if (window.Radar3D.showAllElevs) {
            state.radarData.elevations.forEach((_, i) => window.Radar3D.currentElevations.add(i));
            window.Radar3D.setShowAllElevations(false);
            allBtn.classList.remove('active');
          }
          const nowActive = window.Radar3D.currentElevations.has(idx);
          if (nowActive) {
            window.Radar3D.currentElevations.delete(idx);
          } else {
            window.Radar3D.currentElevations.add(idx);
          }
          window.Radar3D.syncVisibility();
          sub.classList.toggle('active', !nowActive);
          const stillAny = allIndices.some(i => window.Radar3D.currentElevations.has(i));
          mainRow.classList.toggle('active', stillAny);
          updatePointCount();
        });

        subMenu.appendChild(sub);
      });

      wrapper.appendChild(subMenu);

      const chevron = mainRow.querySelector('.elev-cuts-chevron');

      chevron.addEventListener('click', e => {
        e.stopPropagation();
        const open = subMenu.style.display !== 'none';
        subMenu.style.display = open ? 'none' : 'flex';
        chevron.textContent   = open ? '›' : '⌄';
        chevron.classList.toggle('open', !open);
      });

      mainRow.addEventListener('click', () => {
        if (window.Radar3D.showAllElevs) {
          state.radarData.elevations.forEach((_, i) => window.Radar3D.currentElevations.add(i));
          window.Radar3D.setShowAllElevations(false);
          allBtn.classList.remove('active');
        }

        const anyNowActive = allIndices.some(i => window.Radar3D.currentElevations.has(i));

        if (anyNowActive) {
          allIndices.forEach(i => window.Radar3D.currentElevations.delete(i));
          subMenu.style.display = 'none';
          chevron.textContent   = '›';
          chevron.classList.remove('open');
          subMenu.querySelectorAll('.elev-sub-item').forEach(s => s.classList.remove('active'));
          mainRow.classList.remove('active');
        } else {
          window.Radar3D.currentElevations.add(firstIdx);
          subMenu.style.display = 'flex';
          chevron.textContent   = '⌄';
          chevron.classList.add('open');
          subMenu.querySelectorAll('.elev-sub-item').forEach((s, i) => {
            s.classList.toggle('active', i === 0);
          });
          mainRow.classList.add('active');
        }

        window.Radar3D.syncVisibility();
        updatePointCount();
      });

      container.appendChild(wrapper);
    }
  });
}
