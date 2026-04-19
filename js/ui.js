/**
 * ui.js — DOM rendering functions per component
 */

import {
  formatSpeed, getUnitLabel, getSpeedValue, degreesToCardinal,
  normaliseAngle, calcWindComponents, aggregateHistoricalDays,
} from './wind.js';

// ─── Utility ──────────────────────────────────────────────────────────────────

export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

export const show = (el) => { el.hidden = false; };
export const hide = (el) => { el.hidden = true; };
export const visible = (el) => !el.hidden;

// ─── Time Formatting ────────────────────────────────────────────────────────

export const formatRelativeTime = (isoString) => {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleString('en-SG', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// ─── Station Setup ─────────────────────────────────────────────────────────

/**
 * Render station suggestions on the setup screen.
 * @param {Array<{id, name, lat, lon, distance}>} stations
 * @param {Function} onSelect - callback(station)
 */
export const renderStationSuggestions = (stations, onSelect) => {
  const list = $('#station-setup-list');
  list.innerHTML = '';
  for (const s of stations) {
    const btn = document.createElement('button');
    btn.className = 'station-suggestion';
    btn.innerHTML = `
      <span class="station-suggestion__name">${s.name}</span>
      <span class="station-suggestion__distance">${s.distance != null ? s.distance.toFixed(1) + ' km' : ''}</span>
    `;
    btn.addEventListener('click', () => onSelect(s));
    list.appendChild(btn);
  }
};

// ─── Now Card ─────────────────────────────────────────────────────────────────

/**
 * Render wind speed value.
 */
export const renderWindSpeed = (knots, unit) => {
  const valueEl = $('#wind-speed-value');
  const unitEl = $('#wind-speed-unit');
  if (valueEl) {
    valueEl.textContent = knots != null ? formatSpeed(knots, unit) : '—';
  }
  if (unitEl) {
    unitEl.textContent = getUnitLabel(unit);
  }
};

/**
 * Render compass arrow rotation.
 * Wind direction = where wind originates (meteorological).
 * Arrow points in that direction.
 */
export const renderWindDirection = (degrees) => {
  const arrow = $('#compass-arrow');
  const degEl = $('#wind-direction-degrees');
  const cardinalEl = $('#wind-direction-cardinal');
  if (arrow) {
    arrow.style.transform = `rotate(${normaliseAngle(degrees)}deg)`;
  }
  if (degEl) {
    degEl.textContent = degrees != null ? `${Math.round(degrees)}°` : '—°';
  }
  if (cardinalEl) {
    cardinalEl.textContent = degrees != null ? degreesToCardinal(degrees) : '—';
  }
};

/**
 * Render station name.
 */
export const renderStationName = (name) => {
  const el = $('#station-name');
  if (el) el.textContent = name || '—';
};

/**
 * Render last updated text.
 */
export const renderLastUpdated = (isoString) => {
  const el = $('#last-updated');
  if (el) {
    el.textContent = isoString
      ? `Updated ${formatRelativeTime(isoString)}`
      : '—';
  }
};

/**
 * Show/hide the now card skeleton.
 */
export const renderNowLoading = (loading) => {
  const skeleton = $('#now-loading');
  if (skeleton) loading ? show(skeleton) : hide(skeleton);
};

// ─── Headwind Card ───────────────────────────────────────────────────────────

/**
 * Render headwind card.
 */
export const renderHeadwind = (windSpeed, windDir, heading, unit) => {
  const badge = $('#headwind-badge');
  const headingLine = $('#heading-line');
  const headingArrow = $('#heading-arrow');
  const windLine = $('#wind-line');
  const windArrowEl = $('#wind-arrow');
  const tailwindArc = $('#tailwind-arc');
  const headwindArc = $('#headwind-arc');
  const headwindSpeedEl = $('#headwind-speed');
  const headwindUnitEl = $('#headwind-unit');
  const crosswindSpeedEl = $('#crosswind-speed');
  const crosswindUnitEl = $('#crosswind-unit');
  const summaryEl = $('#headwind-summary');

  if (!badge) return;

  if (windSpeed == null || windDir == null) {
    badge.textContent = '—';
    badge.className = 'headwind-badge';
    if (summaryEl) summaryEl.textContent = 'Set your heading to calculate headwind.';
    return;
  }

  const { headwind, crosswind, label } = calcWindComponents(windSpeed, windDir, heading);
  const unitLabel = getUnitLabel(unit);
  const speedVal = getSpeedValue(headwind, unit).toFixed(1);
  const crossVal = getSpeedValue(crosswind, unit).toFixed(1);

  // Badge
  badge.textContent = label;
  badge.className = `headwind-badge headwind-badge--${label.toLowerCase()}`;

  // Headwind magnitude
  if (headwindSpeedEl) headwindSpeedEl.textContent = Math.abs(parseFloat(speedVal)).toFixed(1);
  if (headwindUnitEl) headwindUnitEl.textContent = unitLabel;
  if (crosswindSpeedEl) crosswindSpeedEl.textContent = parseFloat(crossVal).toFixed(1);
  if (crosswindUnitEl) crosswindUnitEl.textContent = unitLabel;

  // Summary
  if (summaryEl) {
    const windDirCardinal = degreesToCardinal(windDir);
    const windSpeedFormatted = formatSpeed(windSpeed, unit);
    if (label === 'HEADWIND') {
      summaryEl.textContent = `Winds from ${windDirCardinal} at ${windSpeedFormatted}${unitLabel}. You're riding into a ${Math.abs(parseFloat(speedVal))}${unitLabel} headwind.`;
    } else if (label === 'TAILWIND') {
      summaryEl.textContent = `Winds from ${windDirCardinal} at ${windSpeedFormatted}${unitLabel}. You've got a ${Math.abs(parseFloat(speedVal))}${unitLabel} tailwind behind you.`;
    } else {
      summaryEl.textContent = `Winds from ${windDirCardinal} at ${windSpeedFormatted}${unitLabel}. ${Math.abs(parseFloat(crossVal))}${unitLabel} of crosswind on your left/right.`;
    }
  }

  // SVG updates
  const hRad = (heading * Math.PI) / 180;
  const cx = 100, cy = 100, r = 90;

  // Cyclist heading direction arrow
  const hx = cx + r * Math.sin(hRad);
  const hy = cy - r * Math.cos(hRad);
  if (headingLine) {
    headingLine.setAttribute('x2', hx);
    headingLine.setAttribute('y2', hy);
  }
  if (headingArrow) {
    headingArrow.setAttribute('points', `${hx},${hy - 10} ${hx - 6},${hy - 2} ${hx},${hy - 6} ${hx + 6},${hy - 2}`);
  }

  // Wind direction line
  const wRad = (windDir * Math.PI) / 180;
  const wx = cx + r * Math.sin(wRad);
  const wy = cy - r * Math.cos(wRad);
  if (windLine) {
    windLine.setAttribute('x2', wx);
    windLine.setAttribute('y2', wy);
  }
  if (windArrowEl) {
    windArrowEl.setAttribute('points', `${wx},${wy - 10} ${wx - 5},${wy - 2} ${wx},${wy - 6} ${wx + 5},${wy - 2}`);
  }

  // Arcs — draw semi-circles relative to heading
  const arcStart = heading;
  const arcEnd = (heading + 180) % 360;
  const arcMid = (heading + 90) % 360;
  const arcMidRad = (arcMid * Math.PI) / 180;
  const arcMidX = cx + r * 0.7 * Math.sin(arcMidRad);
  const arcMidY = cy - r * 0.7 * Math.cos(arcMidRad);

  if (tailwindArc) {
    tailwindArc.setAttribute('d', `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`);
    tailwindArc.setAttribute('transform', `rotate(${heading - 90} ${cx} ${cy})`);
  }
  if (headwindArc) {
    headwindArc.setAttribute('d', `M ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx} ${cy - r}`);
    headwindArc.setAttribute('transform', `rotate(${heading - 90} ${cx} ${cy})`);
  }

  // Heading handle position
  const handle = $('#heading-handle');
  if (handle) {
    handle.setAttribute('cx', hx);
    handle.setAttribute('cy', hy);
  }
};

/**
 * Update the heading selector handle position only (faster update during drag).
 */
export const updateHeadingHandle = (heading) => {
  const handle = $('#heading-handle');
  const headingLine = $('#heading-line');
  const headingArrow = $('#heading-arrow');
  if (!handle) return;

  const hRad = (heading * Math.PI) / 180;
  const cx = 100, cy = 100, r = 90;
  const hx = cx + r * Math.sin(hRad);
  const hy = cy - r * Math.cos(hRad);
  handle.setAttribute('cx', hx);
  handle.setAttribute('cy', hy);
  if (headingLine) {
    headingLine.setAttribute('x2', hx);
    headingLine.setAttribute('y2', hy);
  }
  if (headingArrow) {
    headingArrow.setAttribute('points', `${hx},${hy - 10} ${hx - 6},${hy - 2} ${hx},${hy - 6} ${hx + 6},${hy - 2}`);
  }
};

// ─── History Chart ─────────────────────────────────────────────────────────

/**
 * Render the sparkline chart for historical data.
 * @param {Array} days - aggregated day data
 * @param {Function} onBarClick - callback(dayData, barEl)
 */
export const renderHistoryChart = (days, onBarClick) => {
  const container = $('#history-chart');
  if (!container) return;

  container.innerHTML = '';

  if (!days || days.length === 0) return;

  const maxSpeed = Math.max(...days.map((d) => d.avgSpeed));
  const p50 = maxSpeed * 0.5;
  const p25 = maxSpeed * 0.25;

  for (const day of days) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sparkline-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'sparkline-bar';
    const heightPct = maxSpeed > 0 ? (day.avgSpeed / maxSpeed) * 100 : 0;
    bar.style.height = `${Math.max(heightPct, 4)}%`;

    if (day.avgSpeed >= p50) {
      bar.style.background = 'var(--color-headwind)';
    } else if (day.avgSpeed < p25) {
      bar.style.background = 'var(--color-tailwind)';
    } else {
      bar.style.background = 'var(--color-wind)';
    }

    const label = document.createElement('div');
    label.className = 'sparkline-label';
    label.textContent = day.dayLabel
      ? day.dayLabel.split(' ')[0].substring(0, 3)
      : '';

    wrapper.appendChild(bar);
    wrapper.appendChild(label);
    wrapper.addEventListener('click', () => {
      // Deselect others
      $$('.sparkline-bar', container).forEach((b) => b.classList.remove('expanded'));
      bar.classList.add('expanded');
      onBarClick && onBarClick(day, wrapper);
    });
    container.appendChild(wrapper);
  }
};

/**
 * Show tooltip for a day bar, positioned near the clicked bar.
 */
export const renderHistoryTooltip = (day, wrapper) => {
  const tooltip = $('#history-tooltip');
  if (!tooltip || !day) {
    if (tooltip) hide(tooltip);
    return;
  }
  tooltip.innerHTML = `
    <strong>${day.dayLabel}</strong><br/>
    Avg: ${day.avgSpeed.toFixed(1)} kt<br/>
    Max: ${day.maxSpeed.toFixed(1)} kt<br/>
    Min: ${day.minSpeed.toFixed(1)} kt
    ${day.dominantDirection != null ? `<br/>Dir: ${degreesToCardinal(day.dominantDirection)}` : ''}
  `;
  show(tooltip);

  // Position tooltip near the clicked bar
  if (wrapper) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = tooltip.parentElement?.getBoundingClientRect() ?? wrapperRect;
    const relX = wrapperRect.left - containerRect.left + wrapperRect.width / 2;
    const relY = wrapperRect.top - containerRect.top - 8;
    tooltip.style.left = `${relX}px`;
    tooltip.style.top = `${relY}px`;
    tooltip.style.transform = 'translate(-50%, -100%)';
  }
};

// ─── Bottom Nav Dots ────────────────────────────────────────────────────────

/**
 * Set active dot.
 */
export const setActiveDot = (index) => {
  $$('.bottom-nav__dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
};

// ─── Unit Toggle ────────────────────────────────────────────────────────────

/**
 * Update unit toggle active state.
 */
export const setActiveUnit = (unit) => {
  $$('.unit-toggle__btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.unit === unit);
  });
};

// ─── Offline Banner ─────────────────────────────────────────────────────────

export const showOfflineBanner = () => {
  const banner = $('#offline-banner');
  if (banner) banner.hidden = false;
};

export const hideOfflineBanner = () => {
  const banner = $('#offline-banner');
  if (banner) banner.hidden = true;
};

// ─── Settings / Modal helpers ─────────────────────────────────────────────

/**
 * Open a bottom sheet modal.
 */
export const openModal = (modalId) => {
  const overlay = $(`#${modalId}`);
  if (!overlay) return;
  overlay.hidden = false;
  // Force reflow so transition fires
  void overlay.offsetHeight;
  requestAnimationFrame(() => {
    const sheet = overlay.querySelector('.bottom-sheet');
    if (sheet) sheet.classList.add('open');
  });
};

/**
 * Close a bottom sheet modal.
 */
export const closeModal = (modalId) => {
  const overlay = $(`#${modalId}`);
  if (!overlay) return;
  const sheet = overlay.querySelector('.bottom-sheet');
  if (sheet) {
    sheet.classList.remove('open');
    sheet.addEventListener('transitionend', () => {
      overlay.hidden = true;
    }, { once: true });
    // Fallback timeout
    setTimeout(() => { overlay.hidden = true; }, 350);
  } else {
    overlay.hidden = true;
  }
};

// ─── Station Picker List ────────────────────────────────────────────────────

/**
 * Render station list in the picker modal.
 * @param {Array} stations - with optional distance
 * @param {string} selectedId
 * @param {Function} onSelect
 */
export const renderStationPickerList = (stations, selectedId, onSelect) => {
  const list = $('#station-picker-list');
  if (!list) return;
  list.innerHTML = '';
  for (const s of stations) {
    const item = document.createElement('button');
    item.className = `station-item${s.id === selectedId ? ' selected' : ''}`;
    item.innerHTML = `
      <span class="station-item__name">${s.name}</span>
      ${s.distance != null ? `<span class="station-item__distance">${s.distance.toFixed(1)} km</span>` : ''}
      <svg class="station-item__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    item.addEventListener('click', () => onSelect(s));
    list.appendChild(item);
  }
};

/**
 * Filter station picker list by search query.
 */
export const filterStationPicker = (query) => {
  const items = $$('.station-item');
  const q = query.toLowerCase();
  items.forEach((item) => {
    const name = item.querySelector('.station-item__name').textContent.toLowerCase();
    item.style.display = name.includes(q) ? '' : 'none';
  });
};
