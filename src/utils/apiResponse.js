/**
 * apiResponse.js
 * Small helpers so every endpoint returns JSON in the same shape.
 * Keeps responses predictable for the frontend/Postman tests.
 */

function success(res, statusCode, data) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function error(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { success, error };
