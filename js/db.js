/**
 * db.js — sql.js setup, historical data load/parse/cache via IndexedDB
 *
 * Loads sql.js from CDN, creates an in-memory SQLite DB,
 * persists to IndexedDB as binary blob.
 */

import { resolveHistoricalDownloadUrl, fetchHistoricalCSV } from './api.js';

// ─── sql.js Loader ───────────────────────────────────────────────────────────

let SQL = null;

/**
 * Load sql.js and WASM from CDN.
 * @returns {Promise<SQL>}
 */
const loadSqlJs = async () => {
  if (SQL) return SQL;

  // Dynamic import of the ESM module wrapper
  const initSqlJs = (await import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js'
  )).default;

  SQL = await initSqlJs({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
  });

  return SQL;
};

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

const DB_NAME = 'sgwind_db';
const DB_VERSION = 1;
const STORE_NAME = 'history_blobs';

/**
 * Open IndexedDB.
 */
const openIDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

/**
 * Load a blob from IndexedDB by key.
 */
const idbGet = async (key) => {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/**
 * Store a blob in IndexedDB.
 */
const idbSet = async (key, value) => {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

// ─── Database Operations ────────────────────────────────────────────────────

/**
 * Get or create the DB for a station.
 * @param {string} stationId
 * @param {string} stationName
 * @returns {Promise<{db, isNew}>}
 */
const getOrCreateDb = async (stationId) => {
  const SqlJs = await loadSqlJs();
  const key = `wind_history_${stationId}`;
  const blob = await idbGet(key);

  let db;
  let isNew = false;

  if (blob) {
    db = new SqlJs.Database(blob);
  } else {
    db = new SqlJs.Database();
    isNew = true;
  }

  // Create tables if new
  if (isNew) {
    db.run(`
      CREATE TABLE wind_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        mean_speed REAL,
        max_speed REAL,
        min_speed REAL,
        mean_dir REAL
      );
    `);
    db.run(`CREATE INDEX idx_date ON wind_history(date);`);
  }

  return { db, key, isNew };
};

/**
 * Persist DB blob to IndexedDB.
 */
const persistDb = async (db, key) => {
  const data = db.export();
  const buffer = new Uint8Array(data);
  await idbSet(key, buffer);
};

/**
 * Fetch, parse, and store historical data for a station.
 * @param {string} stationId
 * @param {string} stationName
 * @param {'speed'|'direction'} type
 * @param {number} days - number of past days to fetch
 */
export const loadHistoricalData = async (stationId, stationName, type = 'speed', days = 365) => {
  const { db, key, isNew } = await getOrCreateDb(stationId);

  // Check if we already have data — query last 7 days
  if (!isNew) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().split('T')[0];

    const result = db.exec(`
      SELECT date, mean_speed, max_speed, min_speed, mean_dir
      FROM wind_history
      WHERE date >= '${cutoff}'
      ORDER BY date ASC
    `);

    if (result.length > 0 && result[0].values.length > 0) {
      const rows = result[0].values.map(([date, mean_speed, max_speed, min_speed, mean_dir]) => ({
        date,
        mean_wind_speed: mean_speed,
        max_wind_speed: max_speed,
        min_wind_speed: min_speed,
        mean_wind_dir: mean_dir,
      }));
      return rows;
    }
  }

  // Fetch CSV if no data
  try {
    const { url } = await resolveHistoricalDownloadUrl(type);
    const csvData = await fetchHistoricalCSV(url, stationId, type);

    if (!csvData.length) return [];

    // Build a map of date -> aggregated stats
    const byDate = {};
    for (const row of csvData) {
      const dateKey = String(row.date).substring(0, 10);
      if (!byDate[dateKey]) {
        byDate[dateKey] = { speeds: [], dirs: [] };
      }
      byDate[dateKey].speeds.push(row.value);
      if (row.value != null) byDate[dateKey].dirs.push(row.value);
    }

    // Only keep last `days` days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const insertStmt = db.prepare(
      'INSERT INTO wind_history (date, mean_speed, max_speed, min_speed, mean_dir) VALUES (?, ?, ?, ?, ?)'
    );

    for (const [date, { speeds, dirs }] of Object.entries(byDate)) {
      if (date < cutoffStr) continue;
      const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      const max = speeds.length ? Math.max(...speeds) : 0;
      const min = speeds.length ? Math.min(...speeds) : 0;
      const dirAvg = dirs.length ? dirs.reduce((a, b) => a + b, 0) / dirs.length : 0;
      insertStmt.run([date, avg, max, min, dirAvg]);
    }

    insertStmt.free();
    await persistDb(db, key);

    // Return last 7 days
    return loadHistoricalData(stationId, stationName, type, 7);
  } catch (err) {
    console.error('loadHistoricalData error:', err);
    return [];
  }
};

/**
 * Clear cached data for a station.
 */
export const clearCachedData = async (stationId) => {
  const key = `wind_history_${stationId}`;
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

/**
 * Clear all cached data.
 */
export const clearAllCachedData = async () => {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};
