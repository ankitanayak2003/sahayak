/**
 * health.js
 * Production-ready health and readiness check handlers.
 *
 * Implements:
 * - /health/live: Lightweight process liveness probe for orchestrators (k8s, Docker, cloud runners)
 * - /health/ready: Dependency readiness probe checking MongoDB and Redis without leaking secrets
 * - /health (legacy): Preserves backward compatibility with existing Stage 1 payload format
 */

const { STATUS } = require('../config/constants');
const { getDB } = require('../config/mongodb');
const redisClient = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');
const { success } = require('../utils/apiResponse');

/**
 * GET /health/live
 * Returns 200 if the Node.js process is responsive and event loop is running.
 * Does not make external dependency calls to prevent false restarts during transient DB hiccups.
 */
function healthLiveHandler(req, res) {
  return res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /health/ready
 * Verifies that required backing services (MongoDB, and Redis when required)
 * are connected and responsive before routing client traffic.
 *
 * Returns:
 * - 200 { status: 'ready', checks: { ... } } when all required services are ready
 * - 503 { status: 'unready', checks: { ... } } when any required service fails
 */
async function healthReadyHandler(req, res) {
  const checks = {
    database: STATUS.UNAVAILABLE,
    redis: STATUS.DISCONNECTED,
  };

  let dbReady = false;
  try {
    const db = getDB();
    if (db && typeof db.command === 'function') {
      await db.command({ ping: 1 });
      checks.database = 'connected';
      dbReady = true;
    }
  } catch (error) {
    checks.database = STATUS.UNAVAILABLE;
    logger.warn(`Health readiness database check failed: ${error.message}`);
  }

  const isRedisReady = redisClient && redisClient.status === 'ready';
  const isRedisRequired = env.REDIS_REQUIRED === true;

  if (isRedisReady) {
    checks.redis = STATUS.OK;
  } else if (isRedisRequired) {
    checks.redis = STATUS.UNAVAILABLE;
  } else {
    // Optional in local development or before Phase 3 Redis migration
    checks.redis = 'optional_disconnected';
  }

  const isMongoRequired = env.MONGODB_REQUIRED !== false;
  const mongoPass = !isMongoRequired || dbReady;
  const redisPass = !isRedisRequired || isRedisReady;
  const isReady = mongoPass && redisPass;

  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: isReady ? 'ready' : 'unready',
    checks,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /health (legacy compatibility)
 * Preserves the exact original payload structure for existing clients and tests.
 */
async function legacyHealthHandler(req, res) {
  let databaseStatus = STATUS.UNAVAILABLE;
  try {
    await getDB().command({ ping: 1 });
    databaseStatus = 'connected';
  } catch (error) {
    databaseStatus = STATUS.UNAVAILABLE;
  }

  const redisStatus = redisClient && redisClient.status === 'ready' ? STATUS.OK : STATUS.DISCONNECTED;

  return success(res, 200, {
    application: STATUS.OK,
    server: STATUS.OK,
    database: databaseStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  healthLiveHandler,
  healthReadyHandler,
  legacyHealthHandler,
};
