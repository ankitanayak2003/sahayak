/**
 * routes/index.js
 * Top-level router. In later stages, each feature module will
 * mount its own router here (e.g. router.use('/auth', authRoutes)).
 * Stage 1 only has the health check.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const { STATUS } = require('../config/constants');
const { getDB } = require('../config/mongodb');
const redisClient = require('../config/redis');
const volunteersRoutes = require('./volunteers');
const volunteerBusinessRoutes = require('./volunteerBusiness');
const authRoutes = require('./auth');
const requestsRoutes = require('./requests');
const emergenciesRoutes = require('./emergencies');
const voiceRoutes = require('./voice');

const router = express.Router();

router.use('/volunteers', volunteersRoutes);
router.use('/volunteers', volunteerBusinessRoutes);
router.use('/auth', authRoutes);
router.use('/requests', requestsRoutes);
router.use('/emergencies', emergenciesRoutes);
router.use('/voice', voiceRoutes);

/**
 * GET /health
 * Reports application, server, database, and Redis status.
 * Always returns 200 with the app's own status "ok" as long as
 * the Express process is running - database/redis being down
 * is reported inside the payload, not as an HTTP failure.
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    let databaseStatus = STATUS.UNAVAILABLE;
    try {
      await getDB().command({ ping: 1 });
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = STATUS.UNAVAILABLE;
    }

    // ioredis exposes .status: "ready" means connected and usable.
    const redisStatus = redisClient.status === 'ready' ? STATUS.OK : STATUS.DISCONNECTED;

    return success(res, 200, {
      application: STATUS.OK,
      server: STATUS.OK,
      database: databaseStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
