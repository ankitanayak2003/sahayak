/**
 * password.js
 * Secure one-way password hashing utility for Sahayak.
 * Uses bcrypt, a strong adaptive password hashing algorithm designed for production Node.js apps.
 */

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
