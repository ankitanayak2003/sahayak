const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { error } = require('../utils/apiResponse');

function authenticate(req, res, next) {
  const authorization = req.get('Authorization');

  if (typeof authorization !== 'string') {
    return error(res, 401, 'Authentication required.');
  }

  const authorizationParts = authorization.trim().split(/\s+/);
  if (authorizationParts.length !== 2 || authorizationParts[0] !== 'Bearer' || !authorizationParts[1]) {
    return error(res, 401, 'Authentication required.');
  }

  try {
    const payload = jwt.verify(authorizationParts[1], env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.role !== 'string' ||
      !payload.role
    ) {
      return error(res, 401, 'Authentication required.');
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch (verificationError) {
    return error(res, 401, 'Authentication required.');
  }
}

module.exports = authenticate;
