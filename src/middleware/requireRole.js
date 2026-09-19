const { error } = require('../utils/apiResponse');
const { ROLES } = require('../config/constants');

const validRoles = new Set(Object.values(ROLES));

function requireRole(...allowedRoles) {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => typeof role !== 'string' || !validRoles.has(role))
  ) {
    throw new Error('At least one valid role is required.');
  }

  return function roleMiddleware(req, res, next) {
    if (!req.user || typeof req.user !== 'object' || typeof req.user.role !== 'string' || !req.user.role) {
      return error(res, 401, 'Authentication required.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return error(res, 403, 'Forbidden.');
    }

    return next();
  };
}

module.exports = { requireRole };