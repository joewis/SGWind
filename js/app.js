/**
 * app.js — Main entry, card controller, swipe logic
 */

import { fetchRealtimeWind } from './api.js';
import { loadHistoricalData } from './db.js';
import { getUserPosition, sortByDistance } from './geo.js';
import {
  getState, setState, subscribe,
  store,
} from './state.js';
import {
  $, $$, show, hide,
  renderWindSpeed, renderWindDirection,
  renderStationName, renderLastUpdated, renderNowLoading,
  renderHeadwind, updateHeadingHandle,
  setActiveDot,
  setActiveUnit,
  showOfflineBanner, hideOfflineBanner,
  openModal, closeModal,
  renderStationSuggestions, renderStationPickerList, filterStationPicker,
  formatRelativeTime,
} from './ui.js';
import { aggregateHistoricalDays } from './wind.js';

// ─── LocalStorage helpers ───────────────────────────────────────────────────

const LS_KEYS = {
  station: 'sw_station',
  heading: 'sw_heading',
  unit: 'sw_unit',
  interval: 'sw_interval',
};

const loadFromLS = (key, fallback) => {
  try {
    const val = localStorage.getItem(key);
    return val != null ? JSON.parse(val) : fallback;
  } catch { return fallback; }
};

const saveToLS = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ─── App Initialisation ─────────────────────────────────────────────────────

let pollingTimer = null;
let currentCardIndex = 0;

const init = async () => {
  // Restore persisted state
  const savedStation = loadFromLS(LS_KEYS.station, null);
  const savedHeading = loadFromLS(LS_KEYS.heading, 0);
  const savedUnit = loadFromLS(LS_KEYS.unit, 'km/h');
  const savedInterval = loadFromLS(LS_KEYS.interval, 5 * 60 * 1000);

  setState({
    cyclistHeading: savedHeading,
    unit: savedUnit,
    pollingInterval: savedInterval,
  });

  // Apply unit toggle UI state and re-render values in correct unit
  setActiveUnit(savedUnit);
  renderWindSpeed(getState().windSpeed, savedUnit);

  // Settings interval
  const intervalEl = $('#settings-interval');
  if (intervalEl) intervalEl.value = savedInterval;

  // Online/offline listeners
  window.addEventListener('online', () => {
    setState({ isOnline: true });
    hideOfflineBanner();
    fetchNow();
  });
  window.addEventListener('offline', () => {
    setState({ isOnline: false });
    showOfflineBanner();
  });

  if (!navigator.onLine) showOfflineBanner();

  // Station setup flow
  if (savedStation) {
    setState({ station: savedStation });
    renderStationName(savedStation.name);
    $('#station-setup').hidden = true;
    show($('#app'));
    initApp(savedStation);
  } else {
    show($('#station-setup'));
    initStationSetup();
  }
};

// ─── Station Setup Flow ─────────────────────────────────────────────────────

const initStationSetup = async () => {
  const statusEl = $('#station-setup-status');
  const listEl = $('#station-setup-list');
  const searchBtn = $('#station-setup-search-all');

  const showAllStations = async () => {
    if (statusEl) statusEl.textContent = 'Loading stations…';
    try {
      const windData = await fetchRealtimeWind(null);
      const stations = (windData.stations || []).map((s) => ({
        id: s.id || s.stationId,
        name: s.name,
        lat: s.latitude ?? s.lat,
        lon: s.longitude ?? s.lon,
      }));
      setState({ stations });
      renderStationSuggestions(stations, handleStationSelect);
      if (statusEl) statusEl.textContent = `${stations.length} stations available`;
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Could not load stations.';
      console.error(err);
    }
  };

  const handleStationSelect = (station) => {
    saveToLS(LS_KEYS.station, station);
    setState({ station });
    hide($('#station-setup'));
    show($('#app'));
    initApp(station);
  };

  searchBtn.addEventListener('click', showAllStations);

  // Try geolocation first
  if (statusEl) statusEl.textContent = 'Getting your location…';
  try {
    const pos = await getUserPosition();
    // Fetch stations to get list with coords
    if (statusEl) statusEl.textContent = 'Finding nearest stations…';
    const windData = await fetchRealtimeWind(null);
    const allStations = (windData.stations || []).map((s) => ({
      id: s.id || s.stationId,
      name: s.name,
      lat: s.latitude ?? s.lat,
      lon: s.longitude ?? s.lon,
    }));
    const nearest = sortByDistance(allStations, pos).slice(0, 5);
    setState({ stations: nearest });
    renderStationSuggestions(nearest, handleStationSelect);
    if (statusEl) statusEl.textContent = 'Select a station:';
  } catch (err) {
    console.error('Geolocation failed:', err);
    if (statusEl) statusEl.textContent = 'Location unavailable. Showing all stations.';
    await showAllStations();
  }
};

// ─── Main App ──────────────────────────────────────────────────────────────

const initApp = (station) => {
  renderStationName(station.name);
  setupSwipeCards();
  setupBottomNav();
  setupHeadingSelector();
  setupUnitToggle();
  setupStationPicker();
  setupSettings();
  // setupHistoryCard();

  subscribe('windSpeed', () => {
    const { windSpeed, windDirection, windTimestamp, unit, cyclistHeading } = getState();
    renderWindSpeed(windSpeed, unit);
    renderWindDirection(windDirection);
    renderLastUpdated(windTimestamp);
    renderHeadwind(windSpeed, windDirection, cyclistHeading, unit);
  });

  subscribe('unit', () => {
    const { windSpeed, windDirection, unit, cyclistHeading } = getState();
    renderWindSpeed(windSpeed, unit);
    renderHeadwind(windSpeed, windDirection, cyclistHeading, unit);
  });

  subscribe('cyclistHeading', () => {
    const { windSpeed, windDirection, cyclistHeading, unit } = getState();
    renderHeadwind(windSpeed, windDirection, cyclistHeading, unit);
    updateHeadingHandle(cyclistHeading);
  });

  subscribe('isLoading', () => {
    const { isLoading } = getState();
    renderNowLoading(isLoading.now);
  });

  subscribe('isOnline', () => {
    const { isOnline } = getState();
    isOnline ? hideOfflineBanner() : showOfflineBanner();
  });

  subscribe('fetchError', () => {
    const { fetchError } = getState();
    const speedEl = $('#wind-speed-value');
    const dirEl = $('#wind-direction-degrees');
    if (fetchError) {
      if (speedEl) { speedEl.style.opacity = '0.4'; speedEl.title = 'Failed to fetch — see console'; }
      if (dirEl) { dirEl.style.opacity = '0.4'; }
    } else {
      if (speedEl) { speedEl.style.opacity = ''; speedEl.title = ''; }
      if (dirEl) { dirEl.style.opacity = ''; }
    }
  });

  // Initial fetch
  fetchNow();
  startPolling();

  // Load history
  // loadHistory();
};

// ─── Fetch Realtime Wind ───────────────────────────────────────────────────

const fetchNow = async () => {
  const { station, isLoading } = getState();
  if (!station) return;

  setState((s) => ({ isLoading: { ...s.isLoading, now: true } }));

  try {
    const data = await fetchRealtimeWind(station.id);
    setState({
      windSpeed: data.windSpeed,
      windDirection: data.windDirection,
      windTimestamp: data.timestamp,
      isLoading: { ...getState().isLoading, now: false },
    });
  } catch (err) {
    console.error('fetchNow error:', err);
    setState((s) => ({ isLoading: { ...s.isLoading, now: false }, fetchError: true }));
  }
};

// ─── Polling ───────────────────────────────────────────────────────────────

const startPolling = () => {
  stopPolling();
  const { pollingInterval } = getState();
  pollingTimer = setInterval(fetchNow, pollingInterval);
};

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

// ─── Card Swipe ───────────────────────────────────────────────────────────

const setupSwipeCards = () => {
  const container = $('#cards-container');
  if (!container) return;

  container.addEventListener('scroll', () => {
    const idx = Math.round(container.scrollLeft / container.offsetWidth);
    if (idx !== currentCardIndex) {
      currentCardIndex = idx;
      setActiveDot(idx);
      setState({ currentCardIndex: idx });
    }
  }, { passive: true });
};

// ─── Bottom Nav ────────────────────────────────────────────────────────────

const setupBottomNav = () => {
  const container = $('#cards-container');
  $$('.bottom-nav__dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.index);
      const cardWidth = container.offsetWidth;
      container.scrollTo({ left: idx * cardWidth, behavior: 'smooth' });
      setActiveDot(idx);
      currentCardIndex = idx;
    });
  });
};

// ─── Heading Selector (drag on compass) ────────────────────────────────────

const setupHeadingSelector = () => {
  const compass = $('#headwind-compass');
  if (!compass) return;

  let isDragging = false;

  const getAngleFromEvent = (e) => {
    const rect = compass.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // atan2 gives angle from East; we want from North (clockwise)
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    return Math.round(angle);
  };

  const onMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const angle = getAngleFromEvent(e);
    setState({ cyclistHeading: angle });
    saveToLS(LS_KEYS.heading, angle);
  };

  const onEnd = () => {
    isDragging = false;
    const handle = $('#heading-handle');
    if (handle) handle.classList.remove('dragging');
  };

  // Use Pointer Events API for unified mouse + touch handling
  compass.addEventListener('pointerdown', (e) => {
    isDragging = true;
    compass.setPointerCapture(e.pointerId);
    const handle = $('#heading-handle');
    if (handle) handle.classList.add('dragging');
    onMove(e);
  });

  compass.addEventListener('pointermove', onMove);
  compass.addEventListener('pointerup', onEnd);
  compass.addEventListener('pointercancel', onEnd);

  // Keyboard support
  compass.setAttribute('tabindex', '0');
  compass.setAttribute('role', 'slider');
  compass.setAttribute('aria-label', 'Cyclist heading');
  compass.addEventListener('keydown', (e) => {
    const { cyclistHeading } = getState();
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -5;
    if (!delta) return;
    e.preventDefault();
    const newHeading = ((cyclistHeading + delta) % 360 + 360) % 360;
    setState({ cyclistHeading: newHeading });
    saveToLS(LS_KEYS.heading, newHeading);
  });
};

// ─── Unit Toggle ────────────────────────────────────────────────────────────

const setupUnitToggle = () => {
  $$('.unit-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit;
      setState({ unit });
      saveToLS(LS_KEYS.unit, unit);
      setActiveUnit(unit);
    });
  });
};

// ─── Station Picker ────────────────────────────────────────────────────────

let allStationsCache = [];

const setupStationPicker = () => {
  const btn = $('#btn-station-picker');
  const modal = $('#station-picker-modal');
  const closeBtn = $('#btn-close-station-picker');
  const searchInput = $('#station-search-input');

  const openPicker = async () => {
    openModal('station-picker-modal');
    // Ensure we have station list
    let stations = getState().stations;
    if (!stations || stations.length === 0) {
      try {
        const windData = await fetchRealtimeWind(null);
        stations = (windData.stations || []).map((s) => ({
          id: s.id || s.stationId,
          name: s.name,
          lat: s.latitude ?? s.lat,
          lon: s.longitude ?? s.lon,
        }));
        setState({ stations });
      } catch (err) {
        console.error(err);
      }
    }
    const { station } = getState();
    renderStationPickerList(stations, station?.id, handleStationSelect);
  };

  const handleStationSelect = (newStation) => {
    saveToLS(LS_KEYS.station, newStation);
    setState({ station: newStation });
    renderStationName(newStation.name);
    closeModal('station-picker-modal');
    // Re-fetch for new station
    fetchNow();
    // loadHistory();
  };

  btn.addEventListener('click', openPicker);
  closeBtn.addEventListener('click', () => closeModal('station-picker-modal'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal('station-picker-modal');
  });
  searchInput.addEventListener('input', () => {
    filterStationPicker(searchInput.value);
  });
};

// ─── Settings ──────────────────────────────────────────────────────────────

const setupSettings = () => {
  const btn = $('#btn-settings');
  const modal = $('#settings-modal');
  const closeBtn = $('#btn-close-settings');
  const intervalSelect = $('#settings-interval');
  const unitToggleBtns = $$('#settings-unit-toggle .unit-toggle__btn');
  const clearCacheBtn = $('#btn-clear-cache');

  btn.addEventListener('click', () => openModal('settings-modal'));
  closeBtn.addEventListener('click', () => closeModal('settings-modal'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal('settings-modal');
  });

  intervalSelect.addEventListener('change', () => {
    const interval = parseInt(intervalSelect.value);
    setState({ pollingInterval: interval });
    saveToLS(LS_KEYS.interval, interval);
    startPolling();
  });

  unitToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit;
      setState({ unit });
      saveToLS(LS_KEYS.unit, unit);
      setActiveUnit(unit);
    });
  });

  clearCacheBtn.addEventListener('click', async () => {
    if (!confirm('Clear all cached data?')) return;
    const { station } = getState();
    try {
      const { clearAllCachedData } = await import('./db.js');
      await clearAllCachedData();
      localStorage.clear();
      location.reload();
    } catch (err) {
      console.error('Clear cache error:', err);
    }
  });
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('SW registration failed:', err);
  });
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────
// type="module" scripts are deferred automatically and execute after DOM is parsed.
// We use a simple flag to ensure init() only runs once.
let bootstrapped = false;
const bootstrap = () => {
  if (bootstrapped) return;
  bootstrapped = true;
  init();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
