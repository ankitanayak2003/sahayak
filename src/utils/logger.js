/**
 * logger.js
 * Minimal console-based logger with consistent formatting.
 * Kept dependency-free for Stage 1. Can be swapped for a library
 * like winston/pino later without changing call sites elsewhere.
 */

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (message) => console.log(`[${timestamp()}] [INFO] ${message}`),
  warn: (message) => console.warn(`[${timestamp()}] [WARN] ${message}`),
  error: (message) => console.error(`[${timestamp()}] [ERROR] ${message}`),
};

module.exports = logger;
