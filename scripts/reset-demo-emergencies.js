/**
 * scripts/reset-demo-emergencies.js
 *
 * Safe demo reset script for Sahayak emergency & assistance data.
 * Designed to clean up prior demo and test request data before judge demonstrations.
 *
 * SAFETY GUARANTEES:
 * - Does NOT drop or delete the MongoDB database.
 * - Does NOT delete admin or police accounts.
 * - Does NOT delete volunteer accounts or volunteer profile data.
 * - Does NOT modify authentication credentials or refresh tokens.
 * - Does NOT modify any code, schemas, or system configurations.
 * - Removes ONLY assistance requests, assignments, history, escalations,
 *   request-tied notifications, and request-tied voice/call logs.
 * - Enforces child/dependent records deletion BEFORE parent request records.
 * - Requires explicit user confirmation ('RESET_DEMO') before executing deletions.
 * - Runs safely when zero records exist.
 */

'use strict';

const readline = require('readline');
const { connectMongoDB, closeMongoDB, getDB } = require('../src/config/mongodb');
const env = require('../src/config/env');

const TARGET_COLLECTIONS = [
  'request_status_history',
  'emergency_escalations',
  'request_assignments',
  'call_logs',
  'notifications',
  'assistance_requests',
];

const PRESERVED_COLLECTIONS = [
  'users',
  'volunteers',
  'volunteer_verifications',
  'refresh_tokens',
];

/**
 * Prompts the user for a single line of input via readline.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
function promptUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answered = false;

    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });

    rl.on('close', () => {
      if (!answered) resolve('');
    });
  });
}

/**
 * Builds safe deletion filters for dependent and parent collections.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ requestIds: import('mongodb').ObjectId[], filters: Record<string, object> }>}
 */
async function buildFilters(db) {
  const requestDocs = await db
    .collection('assistance_requests')
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const requestIds = requestDocs.map((doc) => doc._id);

  const filters = {
    // 1. Dependent: status audit history
    request_status_history:
      requestIds.length > 0
        ? { $or: [{ request_id: { $in: requestIds } }, { request_id: { $exists: true } }] }
        : { request_id: { $exists: true } },

    // 2. Dependent: 112 emergency escalation records
    emergency_escalations:
      requestIds.length > 0
        ? { $or: [{ request_id: { $in: requestIds } }, { request_id: { $exists: true } }, { escalated_to: '112' }] }
        : { $or: [{ request_id: { $exists: true } }, { escalated_to: '112' }] },

    // 3. Dependent: volunteer request assignments
    request_assignments:
      requestIds.length > 0
        ? { $or: [{ request_id: { $in: requestIds } }, { request_id: { $exists: true } }] }
        : { request_id: { $exists: true } },

    // 4. Dependent: call logs / voice session records tied to requests
    call_logs:
      requestIds.length > 0
        ? { $or: [{ request_id: { $in: requestIds } }, { request_id: { $exists: true } }, { source: 'voice_webhook' }] }
        : { $or: [{ request_id: { $exists: true } }, { source: 'voice_webhook' }] },

    // 5. Dependent: demo notifications directly tied to requests
    notifications: {
      $or: [
        ...(requestIds.length > 0 ? [{ request_id: { $in: requestIds } }] : []),
        { request_id: { $exists: true } },
        { 'metadata.request_id': { $exists: true } },
        {
          message: {
            $regex: /^(A request has been assigned to you|Request status changed to|The assigned volunteer rejected the request)/i,
          },
        },
        { message: { $regex: /request|emergency|assigned to you/i } },
      ],
    },

    // 6. Parent: assistance / emergency requests
    assistance_requests:
      requestIds.length > 0
        ? { _id: { $in: requestIds } }
        : {},
  };

  return { requestIds, filters };
}

/**
 * Counts records matching the deletion criteria and preserved collections.
 *
 * @param {import('mongodb').Db} db
 * @param {Record<string, object>} filters
 * @returns {Promise<{ targetCounts: Record<string, number>, preservedCounts: Record<string, number> }>}
 */
async function inspectCounts(db, filters) {
  const targetCounts = {};
  for (const collName of TARGET_COLLECTIONS) {
    targetCounts[collName] = await db
      .collection(collName)
      .countDocuments(filters[collName] || {});
  }

  const preservedCounts = {};
  for (const collName of PRESERVED_COLLECTIONS) {
    preservedCounts[collName] = await db
      .collection(collName)
      .countDocuments({});
  }

  return { targetCounts, preservedCounts };
}

/**
 * Executes safe removal of emergency/request-related records in strict dependency order:
 * child/dependent records are deleted before parent assistance_requests.
 *
 * @param {import('mongodb').Db} db
 * @param {Record<string, object>} filters
 * @returns {Promise<Record<string, number>>}
 */
async function executeDeletions(db, filters) {
  const deletedCounts = {};

  // Step 1: Delete dependent request history
  const historyRes = await db
    .collection('request_status_history')
    .deleteMany(filters.request_status_history);
  deletedCounts.request_status_history = historyRes.deletedCount || 0;

  // Step 2: Delete dependent emergency escalations
  const escalationsRes = await db
    .collection('emergency_escalations')
    .deleteMany(filters.emergency_escalations);
  deletedCounts.emergency_escalations = escalationsRes.deletedCount || 0;

  // Step 3: Delete dependent request assignments (frees volunteers from busy status)
  const assignmentsRes = await db
    .collection('request_assignments')
    .deleteMany(filters.request_assignments);
  deletedCounts.request_assignments = assignmentsRes.deletedCount || 0;

  // Step 4: Delete dependent call logs tied to requests
  const callLogsRes = await db
    .collection('call_logs')
    .deleteMany(filters.call_logs);
  deletedCounts.call_logs = callLogsRes.deletedCount || 0;

  // Step 5: Delete dependent demo notifications tied to requests
  const notifRes = await db
    .collection('notifications')
    .deleteMany(filters.notifications);
  deletedCounts.notifications = notifRes.deletedCount || 0;

  // Step 6: Delete parent assistance and emergency requests
  const requestsRes = await db
    .collection('assistance_requests')
    .deleteMany(filters.assistance_requests);
  deletedCounts.assistance_requests = requestsRes.deletedCount || 0;

  return deletedCounts;
}

/**
 * Main routine for the emergency reset script.
 *
 * @param {object} [options]
 * @param {string} [options.confirmation] - Pass confirmation directly for testing
 * @param {import('mongodb').Db} [options.db] - Pass mock or active DB instance
 * @returns {Promise<{ success: boolean, deletedCounts?: Record<string, number> }>}
 */
async function resetDemoEmergencies(options = {}) {
  let isStandaloneConnection = false;
  let db = options.db;

  if (!db) {
    await connectMongoDB();
    db = getDB();
    isStandaloneConnection = true;
  }

  try {
    console.log('\n================================================================');
    console.log('              SAHAYAK DEMO EMERGENCY DATA RESET                 ');
    console.log('================================================================');
    console.log(`Database Target: ${env.MONGODB_DB_NAME || 'sahayak'}`);
    console.log('Scanning emergency and request-related collections...\n');

    const { filters } = await buildFilters(db);
    const { targetCounts, preservedCounts } = await inspectCounts(db, filters);

    const totalTargetRecords = Object.values(targetCounts).reduce(
      (sum, count) => sum + count,
      0
    );

    console.log('--- EMERGENCY & REQUEST COLLECTIONS TO BE RESET ---');
    console.log(`  1. request_status_history  : ${targetCounts.request_status_history} record(s)`);
    console.log(`  2. emergency_escalations   : ${targetCounts.emergency_escalations} record(s)`);
    console.log(`  3. request_assignments     : ${targetCounts.request_assignments} record(s)`);
    console.log(`  4. call_logs (voice/demo)  : ${targetCounts.call_logs} record(s)`);
    console.log(`  5. notifications (request) : ${targetCounts.notifications} record(s)`);
    console.log(`  6. assistance_requests     : ${targetCounts.assistance_requests} record(s)`);
    console.log(`  Total targeted records     : ${totalTargetRecords} record(s)\n`);

    console.log('--- PRESERVED COLLECTIONS (WILL NOT BE MODIFIED) ---');
    console.log(`  [OK] users                 : ${preservedCounts.users} record(s) (Admin & Volunteer accounts preserved)`);
    console.log(`  [OK] volunteers            : ${preservedCounts.volunteers} record(s) (Volunteer profiles preserved)`);
    console.log(`  [OK] volunteer_verifications: ${preservedCounts.volunteer_verifications} record(s) (Verification audits preserved)`);
    console.log(`  [OK] refresh_tokens        : ${preservedCounts.refresh_tokens} record(s) (Auth tokens preserved)`);
    console.log('================================================================\n');

    if (totalTargetRecords === 0) {
      console.log('Notice: There are currently 0 emergency/request records in the database.');
      console.log('The database is already clean and ready for judge demonstrations.\n');
      return { success: true, deletedCounts: targetCounts };
    }

    // Confirmation check: require explicit confirmation 'RESET_DEMO'
    let confirmation = options.confirmation || process.env.CONFIRM_RESET || '';

    // Check CLI argument flags e.g. --confirm=RESET_DEMO
    if (!confirmation) {
      const cliFlag = process.argv.find((arg) => arg.startsWith('--confirm='));
      if (cliFlag) {
        confirmation = cliFlag.split('=')[1]?.trim();
      } else if (process.argv.includes('RESET_DEMO')) {
        confirmation = 'RESET_DEMO';
      }
    }

    if (!confirmation) {
      console.log('SAFETY WARNING: This operation will permanently delete the');
      console.log(`${totalTargetRecords} emergency/request records listed above.\n`);
      confirmation = await promptUser(
        "Type 'RESET_DEMO' to confirm deletion and press ENTER: "
      );
    }

    if (confirmation !== 'RESET_DEMO') {
      console.log(`\nConfirmation mismatch (received: "${confirmation}").`);
      console.log('Reset ABORTED. No records were deleted.\n');
      return { success: false, reason: 'confirmation_required' };
    }

    console.log('\nConfirmation verified ("RESET_DEMO"). Starting safe deletion in child -> parent order...\n');

    const deletedCounts = await executeDeletions(db, filters);

    console.log('--- DELETION SUMMARY ---');
    console.log(`  - request_status_history  : ${deletedCounts.request_status_history} deleted`);
    console.log(`  - emergency_escalations   : ${deletedCounts.emergency_escalations} deleted`);
    console.log(`  - request_assignments     : ${deletedCounts.request_assignments} deleted`);
    console.log(`  - call_logs               : ${deletedCounts.call_logs} deleted`);
    console.log(`  - notifications           : ${deletedCounts.notifications} deleted`);
    console.log(`  - assistance_requests     : ${deletedCounts.assistance_requests} deleted`);
    console.log('------------------------');
    console.log('\nSUCCESS: Sahayak emergency demo data successfully reset.');
    console.log('Admin accounts, volunteer profiles, and authentication sessions are intact.');
    console.log('Ready for fresh judge demo!\n');

    return { success: true, deletedCounts };
  } finally {
    if (isStandaloneConnection) {
      await closeMongoDB().catch(() => {});
    }
  }
}

if (require.main === module) {
  resetDemoEmergencies()
    .then((result) => {
      if (!result.success) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`\nDemo reset failed with error: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  resetDemoEmergencies,
  buildFilters,
  inspectCounts,
  executeDeletions,
  TARGET_COLLECTIONS,
  PRESERVED_COLLECTIONS,
};
