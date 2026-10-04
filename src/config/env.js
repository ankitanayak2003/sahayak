/**
 * env.js
 * Loads environment variables from .env and validates that the
 * required ones are present. Fails fast on startup if something
 * critical is missing, instead of failing later at a random point.
 *
 * This is the ONLY file that should read process.env directly.
 * Every other file should import values from here.
 */

require('dotenv').config({ override: true });

// Variables the app cannot run without.
const REQUIRED_VARS = [
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'SARVAM_TOOL_SHARED_SECRET',
  'EXOTEL_WS_USERNAME',
  'EXOTEL_WS_PASSWORD',
  'PHONE_ENCRYPTION_KEY',
  'PHONE_BLIND_INDEX_SECRET',
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
  SARVAM_API_KEY: process.env.SARVAM_API_KEY || null,
  SARVAM_ORG_ID: process.env.SARVAM_ORG_ID || null,
  SARVAM_WORKSPACE_ID: process.env.SARVAM_WORKSPACE_ID || null,
  SARVAM_APP_ID: process.env.SARVAM_APP_ID || null,
  EXOTEL_WS_PATH: process.env.EXOTEL_WS_PATH || '/ws',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  SARVAM_TOOL_SHARED_SECRET: process.env.SARVAM_TOOL_SHARED_SECRET,
  EXOTEL_WS_USERNAME: process.env.EXOTEL_WS_USERNAME,
  EXOTEL_WS_PASSWORD: process.env.EXOTEL_WS_PASSWORD,
  EXOTEL_ALLOW_UNAUTHENTICATED_WS: process.env.EXOTEL_ALLOW_UNAUTHENTICATED_WS === 'true',
  LIVEKIT_URL: process.env.LIVEKIT_URL || null,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || null,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || null,
  SAHAYAK_BACKEND_URL: process.env.SAHAYAK_BACKEND_URL || (process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:5000'),
  SAHAYAK_TOOL_SHARED_SECRET: process.env.SAHAYAK_TOOL_SHARED_SECRET || process.env.SARVAM_TOOL_SHARED_SECRET || null,
  PHONE_ENCRYPTION_KEY: process.env.PHONE_ENCRYPTION_KEY,
  PHONE_BLIND_INDEX_SECRET: process.env.PHONE_BLIND_INDEX_SECRET,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '',
  TRUST_PROXY: process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : false),
  BODY_LIMIT: process.env.BODY_LIMIT || '10mb',
  REDIS_REQUIRED: process.env.REDIS_REQUIRED === 'true',
  MONGODB_REQUIRED: process.env.MONGODB_REQUIRED !== 'false',
};

module.exports = env;
module.exports.validateEnv = validateEnv;
module.exports.REQUIRED_VARS = REQUIRED_VARS;
