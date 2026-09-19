/**
 * phoneSecurity.js
 * Secure phone-number protection utilities for Sahayak.
 * Includes authenticated encryption for reversible storage and HMAC-SHA256 blind indexes.
 */

const crypto = require('crypto');

const PHONE_ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const PHONE_BLIND_INDEX_ALGORITHM = 'sha256';
const ENCODING = 'utf8';
const BINARY_ENCODING = 'hex';

function normalizePhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string') {
    throw new Error('Phone number must be a string.');
  }

  const digitsOnly = phoneNumber.replace(/\D/g, '');

  if (digitsOnly.length === 0) {
    throw new Error('Phone number must contain at least one digit.');
  }

  return digitsOnly;
}

function getPhoneEncryptionKey() {
  const key = process.env.PHONE_ENCRYPTION_KEY;

  if (!key) {
    throw new Error('PHONE_ENCRYPTION_KEY is not configured.');
  }

  const normalizedKey = key.replace(/\s+/g, '');

  if (normalizedKey.length === 64) {
    return Buffer.from(normalizedKey, BINARY_ENCODING);
  }

  if (normalizedKey.length === 32) {
    return Buffer.from(normalizedKey, ENCODING);
  }

  if (normalizedKey.length === 43 && normalizedKey.startsWith('base64:')) {
    return Buffer.from(normalizedKey.slice(7), 'base64');
  }

  throw new Error('PHONE_ENCRYPTION_KEY must be 64 hex characters or a 32-byte secret.');
}

function getPhoneBlindIndexSecret() {
  const secret = process.env.PHONE_BLIND_INDEX_SECRET;

  if (!secret) {
    throw new Error('PHONE_BLIND_INDEX_SECRET is not configured.');
  }

  return secret;
}

function encodeEncryptedPayload({ iv, ciphertext, tag }) {
  return JSON.stringify({
    iv: iv.toString(BINARY_ENCODING),
    ciphertext: ciphertext.toString(BINARY_ENCODING),
    tag: tag.toString(BINARY_ENCODING),
  });
}

function decodeEncryptedPayload(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Encrypted phone payload is invalid.');
  }

  const payload = JSON.parse(value);

  if (!payload.iv || !payload.ciphertext || !payload.tag) {
    throw new Error('Encrypted phone payload is malformed.');
  }

  return {
    iv: Buffer.from(payload.iv, BINARY_ENCODING),
    ciphertext: Buffer.from(payload.ciphertext, BINARY_ENCODING),
    tag: Buffer.from(payload.tag, BINARY_ENCODING),
  };
}

function encryptPhoneNumber(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const key = getPhoneEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(PHONE_ENCRYPTION_ALGORITHM, key, iv);
  const plaintext = Buffer.from(normalizedPhone, ENCODING);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return encodeEncryptedPayload({ iv, ciphertext, tag });
}

function decryptPhoneNumber(encryptedValue) {
  if (typeof encryptedValue !== 'string' || encryptedValue.length === 0) {
    throw new Error('Encrypted phone payload is empty or invalid.');
  }

  const key = getPhoneEncryptionKey();
  const { iv, ciphertext, tag } = decodeEncryptedPayload(encryptedValue);
  const decipher = crypto.createDecipheriv(PHONE_ENCRYPTION_ALGORITHM, key, iv);

  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString(ENCODING);
}

function createPhoneBlindIndex(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const secret = getPhoneBlindIndexSecret();

  return crypto
    .createHmac(PHONE_BLIND_INDEX_ALGORITHM, secret)
    .update(normalizedPhone, ENCODING)
    .digest(BINARY_ENCODING);
}

module.exports = {
  normalizePhoneNumber,
  encryptPhoneNumber,
  decryptPhoneNumber,
  createPhoneBlindIndex,
};
