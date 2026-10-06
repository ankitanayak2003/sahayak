/**
 * locationValidation.js
 * Validates latitude, longitude, accuracy, and location source metadata.
 * Ensures backward compatibility with existing text-only emergency requests.
 */

const ALLOWED_LOCATION_SOURCES = new Set([
  'browser_gps',
  'manual_pin',
  'caller_provided',
  'geocoded',
  'app',
  'other',
]);

/**
 * Validates coordinate inputs.
 * Returns an object: { valid: boolean, error?: string, location?: object | null }
 */
function validateLocationInput(input = {}) {
  const {
    latitude,
    longitude,
    lat,
    lng,
    accuracy,
    accuracy_meters,
    location_source,
    locationSource,
    location_captured_at,
  } = input;

  const rawLat = latitude !== undefined ? latitude : lat;
  const rawLng = longitude !== undefined ? longitude : lng;

  // Text-only request without coordinates is completely valid
  if (rawLat === undefined && rawLng === undefined) {
    return {
      valid: true,
      hasCoordinates: false,
      location: null,
    };
  }

  // If one coordinate is provided, both must be provided
  if (rawLat === undefined || rawLng === undefined || rawLat === null || rawLng === null || rawLat === '' || rawLng === '') {
    return {
      valid: false,
      error: 'Both latitude and longitude must be provided together.',
    };
  }

  const numLat = Number(rawLat);
  const numLng = Number(rawLng);

  if (!Number.isFinite(numLat)) {
    return {
      valid: false,
      error: 'Latitude must be a valid finite number.',
    };
  }

  if (numLat < -90 || numLat > 90) {
    return {
      valid: false,
      error: `Latitude out of range (${numLat}). Must be between -90 and 90 degrees.`,
    };
  }

  if (!Number.isFinite(numLng)) {
    return {
      valid: false,
      error: 'Longitude must be a valid finite number.',
    };
  }

  if (numLng < -180 || numLng > 180) {
    return {
      valid: false,
      error: `Longitude out of range (${numLng}). Must be between -180 and 180 degrees.`,
    };
  }

  // Validate accuracy in meters if supplied
  const rawAcc = accuracy_meters !== undefined ? accuracy_meters : accuracy;
  let parsedAccuracy = null;
  if (rawAcc !== undefined && rawAcc !== null && rawAcc !== '') {
    const numAcc = Number(rawAcc);
    if (!Number.isFinite(numAcc) || numAcc < 0) {
      return {
        valid: false,
        error: 'Location accuracy must be a non-negative finite number representing meters.',
      };
    }
    parsedAccuracy = Math.round(numAcc * 10) / 10;
  }

  // Validate location source
  const rawSource = location_source || locationSource || 'browser_gps';
  const sourceNormalized = String(rawSource).trim().toLowerCase();
  const validSource = ALLOWED_LOCATION_SOURCES.has(sourceNormalized)
    ? sourceNormalized
    : 'other';

  // Captured at timestamp
  let capturedAt = new Date();
  if (location_captured_at) {
    const parsedDate = new Date(location_captured_at);
    if (!isNaN(parsedDate.getTime())) {
      capturedAt = parsedDate;
    }
  }

  return {
    valid: true,
    hasCoordinates: true,
    location: {
      latitude: numLat,
      longitude: numLng,
      accuracy_meters: parsedAccuracy,
      location_source: validSource,
      location_captured_at: capturedAt,
      // GeoJSON Point format for MongoDB 2dsphere index compatibility
      geojson: {
        type: 'Point',
        coordinates: [numLng, numLat], // GeoJSON order: [longitude, latitude]
      },
    },
  };
}

module.exports = {
  validateLocationInput,
  ALLOWED_LOCATION_SOURCES,
};
