/**
 * server.js
 * Entry point. Starts the HTTP server using the Express app defined in app.js.
 * Manages database initialization, Exotel Voice Gateway attachment, and
 * graceful shutdown for zero-downtime rolling cloud deployments.
 */

const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { connectMongoDB, closeMongoDB } = require('./config/mongodb');
const { initUsersCollection } = require('./database/mongodb/initUsersCollection');
const { initRefreshTokensCollection } = require('./database/mongodb/initRefreshTokensCollection');
const { initCoreIndexes } = require('./database/mongodb/initCoreIndexes');
const { attachExotelVoiceGateway } = require('./services/exotelVoiceGateway');
const redisClient = require('./config/redis');
const logger = require('./utils/logger');

let server;
let wsGateway;
let isShuttingDown = false;

async function gracefulShutdown(options = {}) {
  const signal = options.signal || 'SHUTDOWN';
  const timeoutMs = options.timeoutMs || 10000;
  const targetServer = options.server || server;
  const targetWs = options.wsGateway || wsGateway;

  if (isShuttingDown) {
    logger.warn(`Shutdown already in progress. Ignoring duplicate signal: ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`${signal} received. Initiating graceful shutdown...`);

  // Fallback timer to force-exit if active connections do not drain within timeout
  const forceTimer = setTimeout(() => {
    logger.error(`Graceful shutdown timed out after ${timeoutMs}ms. Forcing process exit.`);
    if (options.exit !== false) {
      process.exit(1);
    }
  }, timeoutMs);
  if (typeof forceTimer.unref === 'function') {
    forceTimer.unref();
  }

  // 1. Close WebSocket Voice Gateway and terminate existing sockets
  if (targetWs) {
    try {
      if (typeof targetWs.close === 'function') {
        targetWs.close();
      }
      logger.info('Exotel Voice Gateway WebSocket closed.');
    } catch (wsErr) {
      logger.warn(`Error closing WebSocket gateway: ${wsErr.message}`);
    }
  }

  // 2. Stop accepting new HTTP connections and drain in-flight requests
  if (targetServer && typeof targetServer.close === 'function') {
    await new Promise((resolve) => {
      targetServer.close((err) => {
        if (err) {
          logger.warn(`Error closing HTTP server: ${err.message}`);
        } else {
          logger.info('HTTP server stopped accepting new connections.');
        }
        resolve();
      });
    });
  }

  // 3. Close Redis connection gracefully
  if (redisClient) {
    try {
      if (typeof redisClient.quit === 'function' && redisClient.status === 'ready') {
        await redisClient.quit();
        logger.info('Redis connection closed.');
      } else if (typeof redisClient.disconnect === 'function') {
        redisClient.disconnect();
      }
    } catch (redisErr) {
      logger.warn(`Redis disconnect during shutdown: ${redisErr.message}`);
    }
  }

  // 4. Close MongoDB connection pool
  try {
    await closeMongoDB();
    logger.info('MongoDB connection closed.');
  } catch (mongoErr) {
    logger.warn(`MongoDB close during shutdown: ${mongoErr.message}`);
  }

  clearTimeout(forceTimer);
  logger.info('Graceful shutdown complete.');

  if (options.exit !== false) {
    process.exit(0);
  }
}

async function startServer() {
  try {
    await connectMongoDB();
    await initUsersCollection();
    await initRefreshTokensCollection();
    await initCoreIndexes();

    server = http.createServer(app);
    wsGateway = attachExotelVoiceGateway(server);

    server.listen(env.PORT, () => {
      logger.info(`Sahayak backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    return server;
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    try {
      await closeMongoDB();
    } catch (cleanupErr) {
      logger.error(`Cleanup failed during shutdown: ${cleanupErr.message}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();

  // Attach OS signal handlers for graceful container termination
  process.on('SIGINT', () => gracefulShutdown({ signal: 'SIGINT' }));
  process.on('SIGTERM', () => gracefulShutdown({ signal: 'SIGTERM' }));
}

module.exports = {
  startServer,
  gracefulShutdown,
  getServer: () => server,
  getWsGateway: () => wsGateway,
};
