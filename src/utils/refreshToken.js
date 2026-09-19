const crypto = require('crypto');

const REFRESH_TOKEN_BYTES = 64;

function generateRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

function hashRefreshToken(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new Error('Refresh token must be a non-empty string.');
  }

  return crypto.createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

module.exports = {
  generateRefreshToken,
  hashRefreshToken,
};
