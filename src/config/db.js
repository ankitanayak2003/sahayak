/**
 * db.js
 * Creates a single shared PostgreSQL connection pool.
 *
 * IMPORTANT: We do NOT connect eagerly at import time and we do NOT
 * let connection errors crash the process. The pool connects lazily
 * when a query is first run, and any background connection errors
 * are just logged. This lets the server start even if PostgreSQL
 * is not running yet.
 */

const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Without this listener, an idle-client error would throw an
// uncaught exception and kill the whole process.
pool.on('error', (err) => {
  logger.error(`Unexpected PostgreSQL pool error: ${err.message}`);
});

module.exports = pool;
