/**
 * wind.js — Wind math: headwind/tailwind/crosswind calculations
 *
 * Meteorological wind direction: degrees clockwise from North,
 * indicating where the wind originates (0=North, 90=East).
 * Cyclist heading: degrees clockwise from North, direction travelling.
 */

// ─── Unit Conversions ────────────────────────────────────────────────────────

export const CONVERSIONS = {
  toKmh: (knots) => knots * 1.852,
  toMs:  (knots) => knots * 0.514444,
  fromKmh: (kmh) => kmh / 1.852,
  fromMs:  (ms)  => ms  / 0.514444,
};

export const formatSpeed = (knots, unit) => {
  switch (unit) {
    case 'kmh': return CONVERSIONS.toKmh(knots).toFixed(1);
    case 'ms':  return CONVERSIONS.toMs(knots).toFixed(1);
    default:    return knots.toFixed(1);
  }
};

export const getUnitLabel = (unit) => {
  switch (unit) {
    case 'kmh': return 'km/h';
    case 'ms':  return 'm/s';
    default:    return 'kt';
  }
};

export const getSpeedValue = (knots, unit) => {
  switch (unit) {
    case 'kmh': return CONVERSIONS.toKmh(knots);
    case 'ms':  return CONVERSIONS.toMs(knots);
    default:    return knots;
  }
};

// ─── Angle Helpers ─────────────────────────────────────────────────────────

/**
 * Normalise angle to 0–359 range
 */
export const normaliseAngle = (deg) => ((deg % 360) + 360) % 360;

/**
 * Signed angle difference: windAngle - heading, adjusted to -180..+180
 */
export const signedAngleDiff = (windDir, heading) => {
  let diff = normaliseAngle(windDir) - normaliseAngle(heading);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

// ─── Wind Component Calculation ────────────────────────────────────────────

/**
 * Calculate headwind/tailwind/crosswind components.
 *
 * @param {number} windSpeed   - speed in knots
 * @param {number} windDir     - meteorological wind direction (degrees)
 * @param {number} heading     - cyclist heading (degrees)
 * @returns {{ headwind, crosswind, label, ratio }}
 *   headwind: positive = headwind, negative = tailwind (in knots)
 *   crosswind: absolute lateral component (in knots)
 *   label: 'HEADWIND' | 'TAILWIND' | 'CROSSWIND'
 *   ratio: crosswind / |headwind| (for threshold check)
 */
export const calcWindComponents = (windSpeed, windDir, heading) => {
  const diff = signedAngleDiff(windDir, heading);
  const diffRad = (diff * Math.PI) / 180;

  const headwind = windSpeed * Math.cos(diffRad);
  const crosswind = Math.abs(windSpeed * Math.sin(diffRad));

  const absHeadwind = Math.abs(headwind);
  const ratio = absHeadwind > 0 ? crosswind / absHeadwind : Infinity;

  let label;
  if (crosswind > 5 && crosswind > absHeadwind) {
    label = 'CROSSWIND';
  } else if (headwind >= 0) {
    label = 'HEADWIND';
  } else {
    label = 'TAILWIND';
  }

  return { headwind, crosswind, label, ratio };
};

// ─── Compass Cardinal ───────────────────────────────────────────────────────

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const degreesToCardinal = (deg) => {
  const d = normaliseAngle(deg);
  const idx = Math.round(d / 22.5) % 16;
  return CARDINALS[idx];
};

// ─── Historical Data Processing ────────────────────────────────────────────

/**
 * Given an array of {date, mean_wind_speed, ...} rows, return last 7 days summary.
 */
export const aggregateHistoricalDays = (rows) => {
  // Group by date (YYYY-MM-DD)
  const byDate = {};
  for (const row of rows) {
    const dateKey = row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : String(row.date).substring(0, 10);
    if (!byDate[dateKey]) {
      byDate[dateKey] = { speeds: [], directions: [] };
    }
    byDate[dateKey].speeds.push(row.mean_wind_speed ?? row.wind_speed ?? 0);
    if (row.mean_wind_dir != null) {
      byDate[dateKey].directions.push(row.mean_wind_dir);
    }
  }

  const sorted = Object.keys(byDate).sort().slice(-7);

  return sorted.map((date) => {
    const { speeds, directions } = byDate[date];
    const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const max = speeds.length ? Math.max(...speeds) : 0;
    const min = speeds.length ? Math.min(...speeds) : 0;

    let dominantDir = null;
    if (directions.length) {
      // Most common direction bucket
      const counts = {};
      for (const d of directions) {
        const bucket = Math.round(d / 22.5) % 16;
        counts[bucket] = (counts[bucket] || 0) + 1;
      }
      let maxCount = 0;
      for (const [bucket, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantDir = parseInt(bucket) * 22.5;
        }
      }
    }

    const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-SG', {
      weekday: 'short', month: 'short', day: 'numeric'
    });

    return {
      date,
      dayLabel,
      avgSpeed: avg,
      maxSpeed: max,
      minSpeed: min,
      dominantDirection: dominantDir,
    };
  });
};
