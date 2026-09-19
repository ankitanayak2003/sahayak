/**
 * env.js
 * Loads environment variables from .env and validates that the
 * required ones are present. Fails fast on startup if something
 * critical is missing, instead of failing later at a random point.
 *
 * This is the ONLY file that should read process.env directly.
 * Every other file should import values from here.
 */

require('dotenv').config();

// Variables the app cannot run without.
const REQUIRED_VARS = [
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'JWT_SECRET',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // Thrown (not just logged) so the server never starts in a half-configured state.
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Check your .env file against .env.example.'
    );
  }
}

validateEnv();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ACCESS_TOKEN_EXPIRES_IN: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m',
};

module.exports = env;
