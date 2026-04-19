/**
 * geo.js — Geolocation and Haversine distance to NEA weather stations
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance between two lat/lon points.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in km
 */
export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Sort stations by distance from a given position.
 * @param {Array<{id, name, lat, lon}>} stations
 * @param {{lat, lon}} position
 * @returns {Array} stations with added `distance` property (km)
 */
export const sortByDistance = (stations, position) => {
  return [...stations]
    .map((s) => ({
      ...s,
      distance: haversineDistance(position.lat, position.lon, s.lat, s.lon),
    }))
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Get browser geolocation as a Promise.
 * @returns {Promise<{lat, lon}>}
 */
export const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 60000 }
    );
  });

/**
 * Get user's position, with fallback to Singapore centre.
 */
export const getUserPosition = async () => {
  try {
    return await getCurrentPosition();
  } catch {
    // Fallback: Singapore centre
    return { lat: 1.3521, lon: 103.8198 };
  }
};
