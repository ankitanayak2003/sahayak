/**
 * rateLimiter.js
 * Distributed rate-limiting middleware backed by Redis with atomic Lua operations.
 *
 * In production or when REDIS_REQUIRED is true, this middleware fails closed (HTTP 503)
 * if Redis is unavailable, rather than silently downgrading to process-local in-memory limits.
 * An in-memory adapter is provided for isolated development and testing environments.
 */

const env = require('../config/env');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

// Process-local memory store used ONLY in isolated dev/tests when Redis is not required.
const memoryStore = new Map();

/**
 * Derives the client IP address respecting Express trusted proxy configuration.
 * Does not blindly trust arbitrary X-Forwarded-For headers from untrusted sources.
 */
function getClientIp(req) {
  if (req && typeof req.ip === 'string' && req.ip) {
    return req.ip;
  }
  const socketAddr = req?.socket?.remoteAddress || req?.connection?.remoteAddress;
  return socketAddr || '127.0.0.1';
}

/**
 * Atomic Redis Lua Script for sliding / fixed window rate limiting.
 * KEYS[1] = Rate limit key
 * ARGV[1] = Window duration in milliseconds
 * ARGV[2] = Maximum allowed requests
 *
 * Returns [current_count, remaining_ttl_ms]
 */
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

/**
 * Factory to create rate-limiting middleware.
 *
 * @param {Object} options
 * @param {number} [options.windowMs=900000] - Window duration in ms (default: 15 min)
 * @param {number} [options.max=100] - Max requests per window
 * @param {string} [options.keyPrefix='rl'] - Redis key prefix
 * @param {string} [options.message] - Custom 429 error message
 * @param {Function} [options.keyGenerator] - Custom key generator (req) => string
 * @param {'auto'|'redis'|'memory'} [options.adapter='auto'] - Storage adapter
 * @param {boolean} [options.failClosed=false] - If true, return 503 when Redis is down
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyPrefix = 'rl',
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req) => `${keyPrefix}:${getClientIp(req)}`,
    adapter = 'auto',
    failClosed = false,
  } = options;

  return async function rateLimiterMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const isProduction = env.NODE_ENV === 'production';
    const isRedisRequired = env.REDIS_REQUIRED === true;
    const shouldFailClosed = failClosed || isProduction || isRedisRequired;

    const isRedisReady =
      redisClient &&
      redisClient.status === 'ready' &&
      !redisClient.isStub &&
      typeof redisClient.eval === 'function';

    // 1. Force memory adapter explicitly (for tests / offline dev)
    if (adapter === 'memory') {
      return handleMemoryRateLimit(key, windowMs, max, message, res, next);
    }

    // 2. If Redis is requested or auto-selected
    if (adapter === 'redis' || adapter === 'auto') {
      if (isRedisReady) {
        try {
          const [current, ttl] = await redisClient.eval(RATE_LIMIT_LUA, 1, key, windowMs, max);
          const currentCount = Number(current);
          const remainingTtlMs = Math.max(0, Number(ttl));
          const retryAfterSeconds = Math.max(1, Math.ceil(remainingTtlMs / 1000));
          const remainingRequests = Math.max(0, max - currentCount);

          res.setHeader('RateLimit-Limit', String(max));
          res.setHeader('RateLimit-Remaining', String(remainingRequests));
          res.setHeader('RateLimit-Reset', String(Math.ceil((Date.now() + remainingTtlMs) / 1000)));

          if (currentCount > max) {
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
              success: false,
              error: 'Too Many Requests',
              message,
              retryAfter: retryAfterSeconds,
            });
          }

          return next();
        } catch (err) {
          logger.error(`Redis rate-limiter execution error: ${err.message}`);
          if (shouldFailClosed) {
            res.setHeader('Retry-After', '60');
            return res.status(503).json({
              success: false,
              error: 'Service Unavailable',
              message: 'Security service temporarily unavailable. Please try again later.',
            });
          }
          return handleMemoryRateLimit(key, windowMs, max, message, res, next);
        }
      }

      // Redis is NOT ready
      if (shouldFailClosed) {
        logger.warn(`Rate limiter blocked request: Redis required but unavailable (key: ${key})`);
        res.setHeader('Retry-After', '60');
        return res.status(503).json({
          success: false,
          error: 'Service Unavailable',
          message: 'Security service temporarily unavailable. Please try again later.',
        });
      }

      // In non-production, non-redis-required dev/test: allow in-memory fallback
      return handleMemoryRateLimit(key, windowMs, max, message, res, next);
    }

    // Fallback if unrecognized adapter
    if (!shouldFailClosed) {
      return handleMemoryRateLimit(key, windowMs, max, message, res, next);
    }

    res.setHeader('Retry-After', '60');
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Security service temporarily unavailable. Please try again later.',
    });
  };
}

function handleMemoryRateLimit(key, windowMs, max, message, res, next) {
  const now = Date.now();
  let record = memoryStore.get(key);

  if (!record || now >= record.resetAt) {
    record = { current: 1, resetAt: now + windowMs };
    memoryStore.set(key, record);
  } else {
    record.current += 1;
  }

  const ttlMs = Math.max(0, record.resetAt - now);
  const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  const remaining = Math.max(0, max - record.current);

  res.setHeader('RateLimit-Limit', String(max));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

  if (record.current > max) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message,
      retryAfter: retryAfterSeconds,
    });
  }

  return next();
}

function _resetMemoryStore() {
  memoryStore.clear();
}

// Pre-configured rate limiters for core routes
const citizenSosRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 SOS submissions per 15 minutes per IP
  keyPrefix: 'rl:sos',
  message: 'Too many emergency requests from this IP. Please wait before submitting another report.',
});

const sendOtpRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 OTP dispatches per 10 minutes per IP
  keyPrefix: 'rl:otp',
  message: 'Too many OTP requests from this IP. Please wait before requesting another OTP.',
});

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes per IP
  keyPrefix: 'rl:login',
  message: 'Too many login attempts. Please try again later.',
});

module.exports = {
  createRateLimiter,
  getClientIp,
  citizenSosRateLimiter,
  sendOtpRateLimiter,
  loginRateLimiter,
  _resetMemoryStore,
};
