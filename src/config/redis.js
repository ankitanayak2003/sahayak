/**
 * redis.js
 * Creates a single shared Redis client using ioredis.
 *
 * IMPORTANT: retryStrategy and error handling are configured so that
 * a missing/unreachable Redis server does NOT crash the app. Redis is
 * attempted once during startup and the health check reports it as
 * "disconnected" until it reconnects.
 */

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const redisClient = new Redis(env.REDIS_URL, {
  // Don't throw on startup if Redis isn't reachable yet.
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  // Do not keep retrying when Redis is unavailable during local development.
  retryStrategy() {
    return null;
  },
});

// Without this listener, connection errors would be unhandled and
// could crash the process.
redisClient.on('error', (err) => {
  logger.error(`Redis connection error: ${err.message}`);
});

// Attempt the initial connection but don't let a failure stop startup.
redisClient.connect().catch((err) => {
  logger.warn(`Redis not available at startup: ${err.message}`);
});

module.exports = redisClient;
