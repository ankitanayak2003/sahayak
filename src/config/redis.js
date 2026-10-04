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

let redisClient = null;

if (env.REDIS_URL) {
  redisClient = new Redis(env.REDIS_URL, {
    // Don't throw on startup if Redis isn't reachable yet.
    lazyConnect: true,
    maxRetriesPerRequest: env.NODE_ENV === 'production' ? 3 : 1,
    retryStrategy(times) {
      if (env.NODE_ENV === 'production' || env.REDIS_REQUIRED) {
        if (times > 10) {
          logger.error('Redis retry limit reached; stopping connection attempts.');
          return null;
        }
        return Math.min(times * 200, 3000);
      }
      // Do not keep retrying when Redis is unavailable during local development.
      return null;
    },
  });

  // Without this listener, connection errors would be unhandled and
  // could crash the process.
  redisClient.on('error', (err) => {
    logger.error(`Redis connection error: ${err.message}`);
  });

  const isTestRunner =
    process.env.NODE_ENV === 'test' ||
    process.execArgv.includes('--test') ||
    process.argv.some((arg) => typeof arg === 'string' && (arg.includes('--test') || arg.includes('test')));

  if (isTestRunner) {
    const unrefStream = () => {
      if (redisClient.stream && typeof redisClient.stream.unref === 'function') {
        redisClient.stream.unref();
      }
    };
    redisClient.on('connect', unrefStream);
    redisClient.on('ready', unrefStream);
  }

  // Attempt the initial connection but don't let a failure stop startup.
  redisClient.connect().catch((err) => {
    logger.warn(`Redis not available at startup: ${err.message}`);
  });
} else {
  // Graceful stub when REDIS_URL is not configured
  redisClient = {
    status: 'disconnected',
    isStub: true,
    ping: async () => { throw new Error('Redis is not configured.'); },
    get: async () => null,
    set: async () => null,
    del: async () => 0,
    eval: async () => { throw new Error('Redis is not configured.'); },
    disconnect: () => {},
    quit: async () => {},
    on: () => {},
    removeListener: () => {},
  };
}

module.exports = redisClient;
