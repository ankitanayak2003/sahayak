/**
 * server.js
 * Entry point. Its only job is to start the HTTP server using the
 * Express app defined in app.js. Keeping this separate from app.js
 * means app.js stays testable without a real listening port.
 */

const env = require('./config/env');
const app = require('./app');
const { connectMongoDB } = require('./config/mongodb');
const { initUsersCollection } = require('./database/mongodb/initUsersCollection');
const { initRefreshTokensCollection } = require('./database/mongodb/initRefreshTokensCollection');
const logger = require('./utils/logger');

let server;

async function startServer() {
  try {
    await connectMongoDB();
    await initUsersCollection();
    await initRefreshTokensCollection();

    server = app.listen(env.PORT, () => {
      logger.info(`Sahayak backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

startServer();

// Graceful shutdown on Ctrl+C / process termination.
process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down server...');
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down server...');
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
});
