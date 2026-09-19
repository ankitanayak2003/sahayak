/**
 * otpService.js
 * Development-only in-memory OTP service for Stage 2B.3 volunteer registration.
 * This is intentionally not suitable for multi-instance production deployments.
 */

const crypto = require('crypto');
const { normalizePhoneNumber } = require('./phoneSecurity');

const OTP_TTL_MS = 5 * 60 * 1000;
const otpStore = new Map();

function buildOtpKey(phoneNumber) {
  return normalizePhoneNumber(phoneNumber);
}

function generateOtpForPhone(phoneNumber) {
  const key = buildOtpKey(phoneNumber);
  const otp = crypto.randomInt(100000, 1000000).toString().padStart(6, '0');

  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    used: false,
  });

  return otp;
}

function verifyOtpForPhone(phoneNumber, submittedOtp) {
  const key = buildOtpKey(phoneNumber);
  const record = otpStore.get(key);

  if (!record) {
    return false;
  }

  if (record.used || Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return false;
  }

  if (record.otp !== String(submittedOtp).trim()) {
    return false;
  }

  record.used = true;
  otpStore.delete(key);
  return true;
}

module.exports = {
  generateOtpForPhone,
  verifyOtpForPhone,
  OTP_TTL_MS,
};
