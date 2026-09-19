/**
 * asyncHandler.js
 * Wraps an async Express route handler so that any rejected
 * promise / thrown error is automatically passed to next(err),
 * instead of every controller needing its own try/catch.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => { ... }));
 */

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
