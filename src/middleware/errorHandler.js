/**
 * errorHandler.js
 * Centralized Express error-handling middleware. Must be registered
 * LAST, after all routes, so it catches errors passed via next(err)
 * or thrown inside asyncHandler-wrapped routes.
 */

const logger = require('../utils/logger');
const env = require('../config/env');

// 404 handler - runs when no route matched the request.
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`);

  const isProduction = env.NODE_ENV === 'production';
  const errorMessage = isProduction && statusCode >= 500
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    // Stack trace only in development, never in production responses.
    ...(!isProduction && { stack: err.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
