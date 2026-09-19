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

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    // Stack trace only in development, never in production responses.
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
