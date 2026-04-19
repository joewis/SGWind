const createStore = (initialState) => {
  let state = { ...initialState };
  const subscriptions = Object.create(null); // plain object instead of Map

  const getState = () => state;

  const setState = (updates) => {
    const prev = state;
    const incoming = typeof updates === 'function' ? updates(state) : updates;
    state = Object.assign({}, state, incoming);
    // Notify subscribers via keys only
    const keys = Object.keys(subscriptions);
    for (const key of keys) {
      const fn = subscriptions[key];
      if (typeof fn === 'function') {
        try { fn(state, prev); } catch(e) { console.error('Subscriber error:', e); }
      }
    }
    const allFns = subscriptions['__all__'];
    if (allFns && Array.isArray(allFns)) {
      for (const fn of allFns) { if (typeof fn === 'function') { try { fn(state, prev); } catch(e) { console.error('__all__ error:', e); } } }
    }
  };

  const subscribe = (key, fn) => {
    subscriptions[key] = fn;
    return () => { delete subscriptions[key]; };
  };

  const subscribeAll = (fn) => {
    if (!subscriptions['__all__']) subscriptions['__all__'] = [];
    subscriptions['__all__'].push(fn);
    return () => {
      const arr = subscriptions['__all__'];
      if (arr) { const idx = arr.indexOf(fn); if (idx !== -1) arr.splice(idx, 1); }
    };
  };

  return { getState, setState, subscribe, subscribeAll };
};

const store = createStore({
  station: null,
  stations: [],
  cyclistHeading: 0,
  windSpeed: null,
  windDirection: null,
  windTimestamp: null,
  historicalData: [],
  unit: 'knots',
  pollingInterval: 5 * 60 * 1000,
  isOnline: navigator.onLine,
  isLoading: { now: false, history: false },
  fetchError: false,
  currentCardIndex: 0,
});

export const getState = store.getState;
export const setState = store.setState;
export const subscribe = store.subscribe;
export { store };
