/**
 * api.js — Fetch wrappers for NEA APIs (realtime + historical)
 */

const REALTIME_BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
const HISTORICAL_BASE_V2 = 'https://api-production.data.gov.sg/v2/public/api';
const HISTORICAL_DOWNLOAD_BASE = 'https://api-open.data.gov.sg/v1/public/api';

// ─── Realtime APIs ────────────────────────────────────────────────────────────

/**
 * Fetch current wind speed readings from NEA realtime API.
 * @returns {Promise<{stations: Array, readings: Array}>}
 */
export const fetchWindSpeed = async () => {
  const res = await fetch(`${REALTIME_BASE}/wind-speed`);
  if (!res.ok) throw new Error(`Wind speed API error: ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Fetch current wind direction readings from NEA realtime API.
 * @returns {Promise<{stations: Array, readings: Array}>}
 */
export const fetchWindDirection = async () => {
  const res = await fetch(`${REALTIME_BASE}/wind-direction`);
  if (!res.ok) throw new Error(`Wind direction API error: ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Fetch both wind speed and direction concurrently.
 * Merges data to return wind data for a given station.
 *
 * @param {string} stationId
 * @returns {Promise<{windSpeed: number, windDirection: number, timestamp: string}>}
 */
export const fetchRealtimeWind = async (stationId) => {
  const [speedData, dirData] = await Promise.all([
    fetchWindSpeed(),
    fetchWindDirection(),
  ]);

  // stations array is in each response; coordinates are in location.latitude/longitude
  const stations = (speedData.stations || []).map((s) => ({
    ...s,
    lat: s.location?.latitude ?? s.lat,
    lon: s.location?.longitude ?? s.lon,
  }));

  const readings = speedData.readings || [];
  const dirReadings = dirData.readings || [];

  // Find reading for the selected station from readings[0].data[{stationId, value}]
  const latestReading = readings[0];
  const latestDirReading = dirReadings[0];

  let speedReading = null;
  let dirReading = null;

  if (latestReading?.data) {
    speedReading = latestReading.data.find((d) => d.stationId === stationId)
      ?? latestReading.data[0]
      ?? null;
  }

  if (latestDirReading?.data) {
    dirReading = latestDirReading.data.find((d) => d.stationId === stationId)
      ?? latestDirReading.data[0]
      ?? null;
  }

  return {
    windSpeed: speedReading?.value ?? null,
    windDirection: dirReading?.value ?? null,
    timestamp: latestReading?.timestamp ?? null,
    stations,
  };
};

// ─── Historical Metadata ────────────────────────────────────────────────────

/**
 * Fetch metadata for a historical collection.
 * @param {'speed'|'direction'} type
 * @returns {Promise<object>}
 */
export const fetchHistoricalMetadata = async (type) => {
  const id = type === 'speed' ? '2280' : '2281';
  const res = await fetch(`${HISTORICAL_BASE_V2}/collections/${id}/metadata`);
  if (!res.ok) throw new Error(`Historical metadata API error: ${res.status}`);
  return res.json();
};

/**
 * Resolve the download URL for the most recent year dataset.
 * Uses the two-step initiate-download + poll-download flow.
 */
export const resolveHistoricalDownloadUrl = async (type) => {
  const metadata = await fetchHistoricalMetadata(type);
  const childDatasets = metadata.data?.collectionMetadata?.childDatasets || [];

  if (!childDatasets.length) throw new Error(`No datasets found for ${type}`);

  // childDatasets is an array of dataset IDs like "d_8f5b395a1750c915..."
  // Try current year first, then most recent available
  const currentYear = new Date().getFullYear();
  const currentYearDs = childDatasets.find((id) => String(id).includes(String(currentYear)));
  const targetId = currentYearDs || childDatasets[childDatasets.length - 1];

  // Step 1: Initiate download
  const initRes = await fetch(
    `${HISTORICAL_DOWNLOAD_BASE}/datasets/${targetId}/initiate-download`
  );
  if (!initRes.ok) throw new Error(`Initiate download error: ${initRes.status}`);
  const initJson = await initRes.json();
  if (initJson.code !== 0) throw new Error(initJson.errorMsg || 'Initiate download failed');

  // Step 2: Poll for download URL
  const pollRes = await fetch(
    `${HISTORICAL_DOWNLOAD_BASE}/datasets/${targetId}/poll-download`
  );
  if (!pollRes.ok) throw new Error(`Poll download error: ${pollRes.status}`);
  const pollJson = await pollRes.json();
  const downloadData = pollJson.data;
  if (!downloadData?.url) throw new Error('No download URL returned');

  return {
    url: downloadData.url,
    datasetId: targetId,
    datasetName: null,
  };
};

/**
 * Fetch and parse a historical CSV for a given station.
 * CSV columns: station_id, date, mean_wind_speed (or mean_wind_dir for direction)
 *
 * @param {string} downloadUrl
 * @param {string} stationId
 * @param {'speed'|'direction'} type
 * @returns {Promise<Array<{date, value}>>}
 */
export const fetchHistoricalCSV = async (downloadUrl, stationId, type) => {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Historical CSV fetch error: ${res.status}`);

  const text = await res.text();
  return parseHistoricalCSV(text, stationId, type);
};

/**
 * Parse a CSV string into rows for a specific station.
 * Handles both speed and direction CSVs.
 */
export const parseHistoricalCSV = (csvText, stationId, type) => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const dateIdx = header.findIndex((h) => h === 'date');
  const stationIdx = header.findIndex((h) => h === 'station_id');
  const valueIdx =
    type === 'speed'
      ? header.findIndex((h) => h === 'mean_wind_speed' || h === 'wind_speed')
      : header.findIndex((h) => h === 'mean_wind_dir' || h === 'wind_direction');

  if (dateIdx === -1 || stationIdx === -1 || valueIdx === -1) {
    // Try fallback column names
    const fallbackValueIdx = header.length > 2 ? 2 : -1;
    if (fallbackValueIdx === -1) return [];
    return lines.slice(1).reduce((acc, line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
      if (cols[stationIdx] === stationId) {
        acc.push({
          date: cols[dateIdx],
          value: parseFloat(cols[fallbackValueIdx]) || 0,
        });
      }
      return acc;
    }, []);
  }

  return lines.slice(1).reduce((acc, line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
    if (cols[stationIdx] === stationId) {
      acc.push({
        date: cols[dateIdx],
        value: parseFloat(cols[valueIdx]) || 0,
      });
    }
    return acc;
  }, []);
};
