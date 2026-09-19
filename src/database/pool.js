/**
 * database/pool.js
 * Small helper built on top of the PostgreSQL pool (config/db.js).
 * Stage 1 only needs a connectivity check for the health endpoint;
 * query helpers for actual tables will be added in later stages.
 */

const pool = require('../config/db');
const { STATUS } = require('../config/constants');

/**
 * Runs a trivial query to check if PostgreSQL is reachable.
 * Never throws - always resolves to a status string, so the
 * health endpoint can report it safely.
 */
async function checkDatabaseStatus() {
  try {
    await pool.query('SELECT 1');
    return STATUS.OK;
  } catch (err) {
    return STATUS.UNAVAILABLE;
  }
}

module.exports = { checkDatabaseStatus };
