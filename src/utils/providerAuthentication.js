const crypto = require('crypto');

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftDigest = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(right, 'utf8').digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function isValidBearerAuthorization(header, secret) {
  if (typeof header !== 'string' || typeof secret !== 'string' || !secret) return false;
  const parts = header.trim().split(/\s+/);
  return parts.length === 2 && parts[0] === 'Bearer' && constantTimeEqual(parts[1], secret);
}

function isValidBasicAuthorization(header, username, password) {
  if (typeof header !== 'string' || typeof username !== 'string' || typeof password !== 'string') return false;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Basic') return false;

  let credentials;
  try {
    credentials = Buffer.from(parts[1], 'base64').toString('utf8');
  } catch (error) {
    return false;
  }

  return constantTimeEqual(credentials, `${username}:${password}`);
}

module.exports = {
  isValidBasicAuthorization,
  isValidBearerAuthorization,
};