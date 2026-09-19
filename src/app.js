/**
 * app.js
 * Builds and configures the Express application: middleware, routes,
 * 404 handler, and error handler.
 *
 * This file does NOT call app.listen() - that belongs in server.js
 * only, so app.js can also be imported directly in tests later
 * without opening a real network port.
 */

const express = require('express');
const cors = require('cors');

const { API_PREFIX } = require('./config/constants');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// --- Global middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.use(API_PREFIX, routes);

// --- 404 + error handling (must be registered last, in this order) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
