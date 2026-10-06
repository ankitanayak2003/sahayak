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

const env = require('./config/env');
const { API_PREFIX } = require('./config/constants');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { healthLiveHandler, healthReadyHandler, legacyHealthHandler } = require('./routes/health');

function buildCorsOptions(allowedOriginsString = env.CORS_ALLOWED_ORIGINS, isProduction = env.NODE_ENV === 'production') {
  const allowedOrigins = (allowedOriginsString || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    origin: function corsOriginValidator(origin, callback) {
      // Allow requests with no origin (e.g. curl, server-to-server, Exotel webhook, mobile apps)
      if (!origin) return callback(null, true);

      // If development or test and no explicit origins configured, allow all
      if (!isProduction && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      // Check wildcard '*'
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Check exact origin match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check wildcard patterns (e.g. *.vercel.app, https://sahayak-*.vercel.app, http://localhost:*)
      const matchesWildcard = allowedOrigins.some((pattern) => {
        if (pattern === '*' || pattern === origin) return true;

        // Host-only wildcard: e.g. *.vercel.app
        if (pattern.startsWith('*.')) {
          const suffix = pattern.slice(2);
          try {
            const parsed = new URL(origin);
            return parsed.hostname.endsWith(`.${suffix}`) || parsed.hostname === suffix;
          } catch {
            return false;
          }
        }

        // Project-scoped pattern with wildcard: e.g. https://sahayak-*.vercel.app or http://localhost:*
        if (pattern.includes('*')) {
          try {
            const escaped = pattern
              .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '[a-zA-Z0-9_-]+');
            const regex = new RegExp(`^${escaped}$`, 'i');
            return regex.test(origin);
          } catch {
            return false;
          }
        }

        return false;
      });

      if (matchesWildcard) {
        return callback(null, true);
      }

      // Disallow origin
      const corsError = new Error(`Origin ${origin} is not permitted by CORS policy.`);
      corsError.statusCode = 403;
      return callback(corsError);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Requested-With'],
    maxAge: 86400,
  };
}

const app = express();

// --- Proxy configuration for reverse proxies (Render, Railway, AWS ALB, Nginx) ---
if (env.TRUST_PROXY !== false && env.TRUST_PROXY !== 'false') {
  const parsedProxy = isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY);
  app.set('trust proxy', parsedProxy);
}

// --- Global middleware ---
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: env.BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT || '10mb' }));

// --- Top-level health endpoints for orchestrator probes (k8s / Docker / Cloud Load Balancers) ---
app.get('/health/live', healthLiveHandler);
app.get('/health/ready', healthReadyHandler);
app.get('/health', legacyHealthHandler);

// --- API Routes ---
app.use(API_PREFIX, routes);

// --- 404 + error handling (must be registered last, in this order) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
module.exports.buildCorsOptions = buildCorsOptions;
