/**
 * constants.js
 * Shared constant values used across the app.
 * Kept minimal for Stage 1 - more will be added as later
 * modules (auth, IVR, etc.) are built.
 */

const API_PREFIX = '/api/v1';

const STATUS = {
  OK: 'ok',
  UNAVAILABLE: 'unavailable',
  DISCONNECTED: 'disconnected',
};

const ROLES = {
  VOLUNTEER: 'volunteer',
  POLICE_ADMIN: 'police_admin',
};

const EMERGENCY_TYPES = ['medical', 'fire', 'accident', 'crime', 'safety_threat', 'other'];

module.exports = {
  API_PREFIX,
  EMERGENCY_TYPES,
  ROLES,
  STATUS,
};
