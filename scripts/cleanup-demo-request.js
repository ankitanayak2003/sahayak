'use strict';

const { ObjectId } = require('mongodb');
const { connectMongoDB, closeMongoDB, getDB } = require('../src/config/mongodb');

const TARGET_REQUEST_ID = '6abcf23732afdc723d00f32c';

async function safeCleanup() {
  await connectMongoDB();
  const db = getDB();

  let targetObjectId;
  try {
    targetObjectId = new ObjectId(TARGET_REQUEST_ID);
  } catch (e) {
    // If not valid ObjectId, keep undefined
  }

  const idQuery = targetObjectId
    ? [{ request_id: targetObjectId }, { request_id: TARGET_REQUEST_ID }]
    : [{ request_id: TARGET_REQUEST_ID }];

  const reqIdQuery = targetObjectId
    ? [{ _id: targetObjectId }, { _id: TARGET_REQUEST_ID }]
    : [{ _id: TARGET_REQUEST_ID }];

  console.log('================================================================');
  console.log(`  SAHAYAK SAFE CLEANUP FOR REQUEST ID: ${TARGET_REQUEST_ID}`);
  console.log('================================================================\n');

  // Baseline inspection
  const prePreserved = {
    users: await db.collection('users').countDocuments({}),
    volunteers: await db.collection('volunteers').countDocuments({}),
    volunteer_verifications: await db.collection('volunteer_verifications').countDocuments({}),
    refresh_tokens: await db.collection('refresh_tokens').countDocuments({}),
    total_assistance_requests: await db.collection('assistance_requests').countDocuments({}),
  };

  console.log('--- PRE-DELETION PRESERVED BASELINE ---');
  console.log(`  users                    : ${prePreserved.users}`);
  console.log(`  volunteers               : ${prePreserved.volunteers}`);
  console.log(`  volunteer_verifications  : ${prePreserved.volunteer_verifications}`);
  console.log(`  refresh_tokens           : ${prePreserved.refresh_tokens}`);
  console.log(`  total assistance_requests: ${prePreserved.total_assistance_requests}\n`);

  // Identify matching records
  const targetRecords = {
    request_status_history: await db.collection('request_status_history').find({ $or: idQuery }).toArray(),
    emergency_escalations: await db.collection('emergency_escalations').find({ $or: idQuery }).toArray(),
    request_assignments: await db.collection('request_assignments').find({ $or: idQuery }).toArray(),
    call_logs: await db.collection('call_logs').find({ $or: idQuery }).toArray(),
    notifications: await db.collection('notifications').find({
      $or: [
        ...idQuery,
        ...(targetObjectId ? [{ 'metadata.request_id': targetObjectId }] : []),
        { 'metadata.request_id': TARGET_REQUEST_ID },
        { message: { $regex: TARGET_REQUEST_ID, $options: 'i' } },
      ],
    }).toArray(),
    assistance_requests: await db.collection('assistance_requests').find({ $or: reqIdQuery }).toArray(),
  };

  console.log('--- IDENTIFIED TARGET RECORDS TO DELETE ---');
  for (const [coll, docs] of Object.entries(targetRecords)) {
    console.log(`  ${coll.padEnd(25)}: ${docs.length} record(s)`);
    docs.forEach(doc => {
      console.log(`    -> id: ${doc._id}, info: ${doc.action || doc.status || doc.category || doc.call_sid || 'matched'}`);
    });
  }
  console.log('');

  if (targetRecords.assistance_requests.length === 0 &&
      targetRecords.request_assignments.length === 0 &&
      targetRecords.request_status_history.length === 0 &&
      targetRecords.emergency_escalations.length === 0 &&
      targetRecords.notifications.length === 0 &&
      targetRecords.call_logs.length === 0) {
    console.log('No matching records found. The request was already deleted or does not exist.');
    await closeMongoDB();
    return;
  }

  // Execute deletion in strict child -> parent dependency order
  console.log('--- EXECUTING DELETIONS IN SAFE DEPENDENCY ORDER ---');

  // 1. request_status_history
  const historyResult = await db.collection('request_status_history').deleteMany({ $or: idQuery });
  console.log(`  [1] Deleted from request_status_history : ${historyResult.deletedCount}`);

  // 2. emergency_escalations
  const escalationsResult = await db.collection('emergency_escalations').deleteMany({ $or: idQuery });
  console.log(`  [2] Deleted from emergency_escalations  : ${escalationsResult.deletedCount}`);

  // 3. request_assignments
  const assignmentsResult = await db.collection('request_assignments').deleteMany({ $or: idQuery });
  console.log(`  [3] Deleted from request_assignments    : ${assignmentsResult.deletedCount}`);

  // 4. call_logs
  const callLogsResult = await db.collection('call_logs').deleteMany({ $or: idQuery });
  console.log(`  [4] Deleted from call_logs              : ${callLogsResult.deletedCount}`);

  // 5. notifications
  const notifFilter = {
    $or: [
      ...idQuery,
      ...(targetObjectId ? [{ 'metadata.request_id': targetObjectId }] : []),
      { 'metadata.request_id': TARGET_REQUEST_ID },
      { message: { $regex: TARGET_REQUEST_ID, $options: 'i' } },
    ],
  };
  const notifResult = await db.collection('notifications').deleteMany(notifFilter);
  console.log(`  [5] Deleted from notifications          : ${notifResult.deletedCount}`);

  // 6. assistance_requests (parent)
  const requestResult = await db.collection('assistance_requests').deleteMany({ $or: reqIdQuery });
  console.log(`  [6] Deleted from assistance_requests    : ${requestResult.deletedCount}\n`);

  // Verification step
  console.log('--- POST-DELETION VERIFICATION ---');
  const postCounts = {
    assistance_requests: await db.collection('assistance_requests').countDocuments({ $or: reqIdQuery }),
    request_assignments: await db.collection('request_assignments').countDocuments({ $or: idQuery }),
    request_status_history: await db.collection('request_status_history').countDocuments({ $or: idQuery }),
    emergency_escalations: await db.collection('emergency_escalations').countDocuments({ $or: idQuery }),
    call_logs: await db.collection('call_logs').countDocuments({ $or: idQuery }),
    notifications: await db.collection('notifications').countDocuments(notifFilter),
  };

  let allClean = true;
  for (const [coll, count] of Object.entries(postCounts)) {
    const isClean = count === 0;
    if (!isClean) allClean = false;
    console.log(`  Target query in ${coll.padEnd(25)}: ${count} remaining [${isClean ? 'PASSED' : 'FAILED'}]`);
  }

  const postPreserved = {
    users: await db.collection('users').countDocuments({}),
    volunteers: await db.collection('volunteers').countDocuments({}),
    volunteer_verifications: await db.collection('volunteer_verifications').countDocuments({}),
    refresh_tokens: await db.collection('refresh_tokens').countDocuments({}),
    total_assistance_requests: await db.collection('assistance_requests').countDocuments({}),
  };

  console.log('\n--- PRESERVED COLLECTIONS INTEGRITY CHECK ---');
  console.log(`  users                   : ${postPreserved.users} (was ${prePreserved.users}) -> ${postPreserved.users === prePreserved.users ? 'UNCHANGED [PASSED]' : 'CHANGED [FAILED]'}`);
  console.log(`  volunteers              : ${postPreserved.volunteers} (was ${prePreserved.volunteers}) -> ${postPreserved.volunteers === prePreserved.volunteers ? 'UNCHANGED [PASSED]' : 'CHANGED [FAILED]'}`);
  console.log(`  volunteer_verifications : ${postPreserved.volunteer_verifications} (was ${prePreserved.volunteer_verifications}) -> ${postPreserved.volunteer_verifications === prePreserved.volunteer_verifications ? 'UNCHANGED [PASSED]' : 'CHANGED [FAILED]'}`);
  console.log(`  refresh_tokens          : ${postPreserved.refresh_tokens} (was ${prePreserved.refresh_tokens}) -> ${postPreserved.refresh_tokens === prePreserved.refresh_tokens ? 'UNCHANGED [PASSED]' : 'CHANGED [FAILED]'}`);
  console.log(`  remaining requests      : ${postPreserved.total_assistance_requests} (expected ${prePreserved.total_assistance_requests - 1}) -> ${postPreserved.total_assistance_requests === prePreserved.total_assistance_requests - 1 ? 'EXACTLY 1 LESS [PASSED]' : 'UNEXPECTED [FAILED]'}`);

  if (allClean && postPreserved.users === prePreserved.users && postPreserved.volunteers === prePreserved.volunteers) {
    console.log('\n================================================================');
    console.log('SUCCESS: Target request and all related records cleanly removed.');
    console.log('All user and volunteer accounts are 100% intact.');
    console.log('The database is ready for a fresh judge demo request.');
    console.log('================================================================\n');
  } else {
    console.error('\nERROR: Verification failed! Check above counts.');
    process.exitCode = 1;
  }

  await closeMongoDB();
}

safeCleanup().catch((err) => {
  console.error('Safe cleanup error:', err);
  process.exit(1);
});
