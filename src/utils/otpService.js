/**
 * otpService.js
 * Redis-backed distributed OTP service with HMAC-SHA256 keyed hashing,
 * atomic Lua verification to prevent race condition brute-forcing,
 * 5-minute TTL, single-use invalidation, and maximum of 5 attempts.
 *
 * In production or when REDIS_REQUIRED is true, operations fail closed (503)
 * if Redis is unavailable. An in-memory store is preserved for isolated dev/tests.
 */

const crypto = require('crypto');
const env = require('../config/env');
const redisClient = require('../config/redis');
const logger = require('./logger');
const { normalizePhoneNumber } = require('./phoneSecurity');

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_TTL_MS = OTP_TTL_SECONDS * 1000;
const MAX_OTP_ATTEMPTS = 5;

// Fallback in-memory storage for isolated development/test environments
const memoryOtpStore = new Map();

function buildOtpKey(phoneNumber) {
  return normalizePhoneNumber(phoneNumber);
}

function getRedisOtpKey(phoneKey) {
  return `sahayak:otp:${phoneKey}`;
}

/**
 * Computes a keyed HMAC-SHA256 hash of the phoneKey and OTP.
 * Plaintext OTPs are NEVER stored in Redis or database.
 */
function hashOtp(phoneKey, otp) {
  const secret = env.PHONE_BLIND_INDEX_SECRET || env.JWT_SECRET || 'sahayak-otp-secret';
  return crypto.createHmac('sha256', secret).update(`${phoneKey}:${otp}`).digest('hex');
}

/**
 * Redis Lua script for atomic OTP verification and attempt tracking.
 * Prevents concurrent requests from bypassing the 5-attempt limit.
 *
 * KEYS[1] = sahayak:otp:<phoneKey>
 * ARGV[1] = expected HMAC hash
 * ARGV[2] = maximum allowed attempts (5)
 *
 * Returns:
 *   1 = Verification succeeded (record purged atomically for single-use)
 *   0 = Verification failed or lockout reached (or already purged/expired)
 */
const VERIFY_OTP_LUA = `
local exists = redis.call('EXISTS', KEYS[1])
if exists == 0 then
  return 0
end

local storedHash = redis.call('HGET', KEYS[1], 'hash')
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
local used = redis.call('HGET', KEYS[1], 'used')

if used == '1' then
  redis.call('DEL', KEYS[1])
  return 0
end

if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 0
end

if storedHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
else
  attempts = attempts + 1
  if attempts >= tonumber(ARGV[2]) then
    redis.call('DEL', KEYS[1])
  else
    redis.call('HSET', KEYS[1], 'attempts', attempts)
  end
  return 0
end
`;

function isRedisOperational() {
  return Boolean(
    redisClient &&
    redisClient.status === 'ready' &&
    !redisClient.isStub &&
    typeof redisClient.eval === 'function'
  );
}

function shouldFailClosed() {
  return env.NODE_ENV === 'production' || env.REDIS_REQUIRED === true;
}

/**
 * Generates a 6-digit OTP, stores its HMAC hash in Redis (or dev memory fallback),
 * and returns the plaintext 6-digit OTP to the caller for delivery.
 *
 * @param {string} phoneNumber
 * @returns {Promise<string>} 6-digit OTP
 */
async function generateOtpForPhone(phoneNumber) {
  const key = buildOtpKey(phoneNumber);
  const otp = crypto.randomInt(100000, 1000000).toString().padStart(6, '0');
  const hashedOtp = hashOtp(key, otp);

  if (isRedisOperational()) {
    const redisKey = getRedisOtpKey(key);
    try {
      const pipeline = redisClient.multi();
      pipeline.hmset(redisKey, 'hash', hashedOtp, 'attempts', '0', 'used', '0');
      pipeline.expire(redisKey, OTP_TTL_SECONDS);
      const results = await pipeline.exec();
      if (results && results.some(([err]) => err)) {
        throw new Error('Pipeline command failed');
      }
      return otp;
    } catch (err) {
      logger.error(`Redis error generating OTP for ${key}: ${err.message}`);
      if (shouldFailClosed()) {
        const serviceError = new Error('OTP security service is temporarily unavailable.');
        serviceError.statusCode = 503;
        throw serviceError;
      }
    }
  }

  // Redis unavailable
  if (shouldFailClosed()) {
    logger.error(`OTP generation blocked: Redis required but unavailable in production.`);
    const serviceError = new Error('OTP security service is temporarily unavailable.');
    serviceError.statusCode = 503;
    throw serviceError;
  }

  // Development / test in-memory fallback
  memoryOtpStore.set(key, {
    hash: hashedOtp,
    expiresAt: Date.now() + OTP_TTL_MS,
    used: false,
    attempts: 0,
  });

  return otp;
}

/**
 * Verifies submitted OTP against the stored keyed hash atomically.
 * Enforces single-use invalidation and max 5 attempts lockout.
 *
 * @param {string} phoneNumber
 * @param {string} submittedOtp
 * @returns {Promise<boolean>}
 */
async function verifyOtpForPhone(phoneNumber, submittedOtp) {
  let key;
  try {
    key = buildOtpKey(phoneNumber);
  } catch {
    return false;
  }

  if (!key) {
    return false;
  }

  const cleanOtp = String(submittedOtp || '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return false;
  }

  const expectedHash = hashOtp(key, cleanOtp);

  if (isRedisOperational()) {
    const redisKey = getRedisOtpKey(key);
    try {
      const result = await redisClient.eval(VERIFY_OTP_LUA, 1, redisKey, expectedHash, MAX_OTP_ATTEMPTS);
      return Number(result) === 1;
    } catch (err) {
      logger.error(`Redis error verifying OTP for ${key}: ${err.message}`);
      if (shouldFailClosed()) {
        const serviceError = new Error('OTP security service is temporarily unavailable.');
        serviceError.statusCode = 503;
        throw serviceError;
      }
    }
  }

  // Redis unavailable
  if (shouldFailClosed()) {
    logger.error(`OTP verification blocked: Redis required but unavailable in production.`);
    const serviceError = new Error('OTP security service is temporarily unavailable.');
    serviceError.statusCode = 503;
    throw serviceError;
  }

  // Development / test in-memory fallback
  const record = memoryOtpStore.get(key);
  if (!record) {
    return false;
  }

  if (record.used || Date.now() > record.expiresAt) {
    memoryOtpStore.delete(key);
    return false;
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    memoryOtpStore.delete(key);
    return false;
  }

  if (record.hash !== expectedHash) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      memoryOtpStore.delete(key);
    }
    return false;
  }

  record.used = true;
  memoryOtpStore.delete(key);
  return true;
}

function _clearOtpMemoryStore() {
  memoryOtpStore.clear();
}

module.exports = {
  generateOtpForPhone,
  verifyOtpForPhone,
  buildOtpKey,
  hashOtp,
  OTP_TTL_MS,
  OTP_TTL_SECONDS,
  MAX_OTP_ATTEMPTS,
  _clearOtpMemoryStore,
};
