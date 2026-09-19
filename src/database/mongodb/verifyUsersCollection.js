/**
 * verifyUsersCollection.js
 * Development-only verification for the live MongoDB Atlas users collection.
 * It validates schema rules, uniqueness constraints, and final cleanup without
 * changing production startup behavior or leaving any temporary documents behind.
 */

const { ObjectId } = require('mongodb');
const { connectMongoDB, getDB, closeMongoDB } = require('../../config/mongodb');

const MARKER_PREFIX = 'stage2a7_verification_';
const REQUIRED_INDEXES = [
  '_id_',
  'uniq_phone_number_blind_index_non_null',
  'uniq_email_case_insensitive',
];

function makeTempUser(overrides = {}) {
  const marker = `${MARKER_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    _id: new ObjectId(),
    marker,
    email: `${marker}@example.com`,
    password_hash: `hash_${marker}`,
    role: 'volunteer',
    account_status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupTemporaryDocuments(usersCollection) {
  const result = await usersCollection.deleteMany({ marker: { $regex: `^${MARKER_PREFIX}` } });
  return result.deletedCount;
}

async function verifyUsersCollection() {
  const db = await connectMongoDB();
  const usersCollection = db.collection('users');
  const totalBefore = await usersCollection.countDocuments();

  const results = {
    connectionSucceeded: true,
    databaseName: db.databaseName,
    collectionExists: false,
    schemaPresent: false,
    requiredFields: [],
    validRoles: [],
    validAccountStatuses: [],
    invalidRoleRejected: false,
    invalidStatusRejected: false,
    invalidBlindIndexRejected: false,
    duplicateBlindIndexRejected: false,
    duplicateEmailRejected: false,
    missingPhoneOrEmailAllowed: false,
    leftoverTemporaryDocuments: 0,
    beforeUserCount: totalBefore,
    afterUserCount: totalBefore,
    indexes: [],
    unexpectedIndexes: [],
    issue: null,
  };

  try {
    const collectionInfo = await db.command({ listCollections: 1, filter: { name: 'users' } });
    const collectionDetails = collectionInfo.cursor.firstBatch.find((item) => item.name === 'users');
    results.collectionExists = !!collectionDetails;
    await assert(results.collectionExists, 'users collection does not exist.');

    const validator = collectionDetails.options && collectionDetails.options.validator ? collectionDetails.options.validator : null;
    results.schemaPresent = !!validator;
    await assert(results.schemaPresent, 'MongoDB JSON Schema validator is missing from users collection.');

    const schema = validator.$jsonSchema;
    results.requiredFields = schema.required;
    results.validRoles = schema.properties.role.enum;
    results.validAccountStatuses = schema.properties.account_status.enum;

    await assert(JSON.stringify(results.requiredFields) === JSON.stringify(['password_hash', 'role', 'account_status', 'created_at', 'updated_at']), 'Required fields do not match the expected users schema.');
    await assert(JSON.stringify(results.validRoles) === JSON.stringify(['volunteer', 'police_admin']), 'Allowed roles do not match the expected Sahayak design.');
    await assert(JSON.stringify(results.validAccountStatuses) === JSON.stringify(['active', 'suspended', 'deleted']), 'Allowed account statuses do not match the expected Sahayak design.');

    const invalidRoleDoc = makeTempUser({ role: 'admin', phone_number_blind_index: 'a'.repeat(64) });
    try {
      await usersCollection.insertOne(invalidRoleDoc);
    } catch (error) {
      results.invalidRoleRejected = true;
    }
    await assert(results.invalidRoleRejected, 'Invalid role value was accepted when it should have been rejected.');

    const invalidStatusDoc = makeTempUser({ account_status: 'pending', phone_number_blind_index: 'b'.repeat(64) });
    try {
      await usersCollection.insertOne(invalidStatusDoc);
    } catch (error) {
      results.invalidStatusRejected = true;
    }
    await assert(results.invalidStatusRejected, 'Invalid account_status value was accepted when it should have been rejected.');

    const invalidBlindIndexDoc = makeTempUser({ phone_number_blind_index: 'abc123' });
    try {
      await usersCollection.insertOne(invalidBlindIndexDoc);
    } catch (error) {
      results.invalidBlindIndexRejected = true;
    }
    await assert(results.invalidBlindIndexRejected, 'Invalid phone_number_blind_index format was accepted when it should have been rejected.');

    const validBlindIndexDocA = makeTempUser({ email: `phonedup_a_${Date.now()}@example.com`, phone_number_blind_index: '1'.repeat(64) });
    const validBlindIndexDocB = makeTempUser({ email: `phonedup_b_${Date.now()}@example.com`, phone_number_blind_index: '1'.repeat(64) });
    try {
      await usersCollection.insertOne(validBlindIndexDocA);
      try {
        await usersCollection.insertOne(validBlindIndexDocB);
      } catch (error) {
        results.duplicateBlindIndexRejected = true;
      }
    } finally {
      await usersCollection.deleteMany({ _id: { $in: [validBlindIndexDocA._id, validBlindIndexDocB._id] } });
    }
    await assert(results.duplicateBlindIndexRejected, 'Duplicate non-null phone_number_blind_index values were accepted when they should have been rejected.');

    const duplicateEmailA = makeTempUser({ email: 'User@Example.com', phone_number_blind_index: '2'.repeat(64) });
    const duplicateEmailB = makeTempUser({ email: 'user@example.com', phone_number_blind_index: '3'.repeat(64) });
    try {
      await usersCollection.insertOne(duplicateEmailA);
      try {
        await usersCollection.insertOne(duplicateEmailB);
      } catch (error) {
        results.duplicateEmailRejected = true;
      }
    } finally {
      await usersCollection.deleteMany({ _id: { $in: [duplicateEmailA._id, duplicateEmailB._id] } });
    }
    await assert(results.duplicateEmailRejected, 'Duplicate email values were accepted even though they must be case-insensitive unique.');

    const missingPhoneEmailDoc = makeTempUser({
      password_hash: 'hash_missing_contact',
    });
    delete missingPhoneEmailDoc.email;
    delete missingPhoneEmailDoc.phone_number_blind_index;
    try {
      await usersCollection.insertOne(missingPhoneEmailDoc);
      results.missingPhoneOrEmailAllowed = true;
    } finally {
      await usersCollection.deleteOne({ _id: missingPhoneEmailDoc._id });
    }
    await assert(results.missingPhoneOrEmailAllowed, 'Document without phone/email was rejected even though the schema permits it.');

    const indexList = await usersCollection.indexes();
    results.indexes = indexList.map((index) => ({
      name: index.name,
      key: index.key,
      unique: !!index.unique,
      partialFilterExpression: index.partialFilterExpression || null,
      collation: index.collation || null,
    }));

    const indexNames = indexList.map((index) => index.name);
    results.unexpectedIndexes = indexNames.filter((name) => !REQUIRED_INDEXES.includes(name));
    await assert(indexNames.includes('_id_'), 'The default _id_ index is missing.');
    await assert(indexNames.includes('uniq_phone_number_blind_index_non_null'), 'The required phone blind-index unique index is missing.');
    await assert(indexNames.includes('uniq_email_case_insensitive'), 'The required email unique index is missing.');
    await assert(results.unexpectedIndexes.length === 0, `Unexpected additional user indexes were created: ${results.unexpectedIndexes.join(', ')}`);

    const temporaryDeletedCount = await cleanupTemporaryDocuments(usersCollection);
    results.leftoverTemporaryDocuments = await usersCollection.countDocuments({ marker: { $regex: `^${MARKER_PREFIX}` } });
    await assert(results.leftoverTemporaryDocuments === 0, `Temporary verification documents were not cleaned up: ${results.leftoverTemporaryDocuments}`);

    results.afterUserCount = await usersCollection.countDocuments();
    await assert(results.afterUserCount === totalBefore, `User count changed during verification: before=${totalBefore}, after=${results.afterUserCount}`);

    return results;
  } catch (error) {
    results.issue = error.message;
    const temporaryDeletedCount = await cleanupTemporaryDocuments(usersCollection).catch(() => 0);
    results.leftoverTemporaryDocuments = await usersCollection.countDocuments({ marker: { $regex: `^${MARKER_PREFIX}` } }).catch(() => 0);
    results.afterUserCount = await usersCollection.countDocuments().catch(() => null);
    throw error;
  } finally {
    await closeMongoDB();
  }
}

(async () => {
  try {
    const result = await verifyUsersCollection();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`VERIFICATION_FAILED: ${error.message}`);
    process.exitCode = 1;
  }
})();
