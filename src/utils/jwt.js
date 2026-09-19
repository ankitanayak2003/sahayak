const jwt = require('jsonwebtoken');
const env = require('../config/env');

function generateAccessToken(user) {
  if (!user || user._id === undefined || user._id === null) {
    throw new Error('User _id is required to generate an access token.');
  }
  if (typeof user.email !== 'string' || !user.email.trim()) {
    throw new Error('User email is required to generate an access token.');
  }
  if (typeof user.role !== 'string' || !user.role.trim()) {
    throw new Error('User role is required to generate an access token.');
  }

  const userId = String(user._id);
  if (!userId) {
    throw new Error('User _id is required to generate an access token.');
  }

  return jwt.sign(
    {
      sub: userId,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_ACCESS_TOKEN_EXPIRES_IN,
    }
  );
}

module.exports = { generateAccessToken };
