const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { createSarvamEmergencyHandler } = require('../src/routes/sarvam');
const { GeminiClassificationError } = require('../src/services/geminiService');

function responseRecorder(resolve) {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      resolve(this);
      return this;
    },
  };
}

function requestBody(overrides = {}) {
  return {
    caller_phone: '+919999999999',
    interaction_id: 'interaction-1',
    emergency_type: 'medical',
    location: 'Sector 1',
    description: 'Caller needs urgent medical assistance.',
    severity: 'low',
    ...overrides,
  };
}

function classification(overrides = {}) {
  return {
    is_emergency: true,
    emergency_type: 'medical',
    severity: 'high',
    disposition: 'emergency',
    reason: 'Immediate danger is reported.',
    ...overrides,
  };
}

function fakeDatabase() {
  const requests = [];
  const history = [];
  const collections = {
    assistance_requests: {
      async createIndex() {},
      async findOne(query) {
        return requests.find((request) => (
          (query.interaction_id && request.interaction_id === query.interaction_id)
          || (query._id && request._id.equals(query._id))
        )) || null;
      },
      async insertOne(document) {
        if (requests.some((request) => request.interaction_id === document.interaction_id)) {
          const duplicate = new Error('duplicate interaction_id');
          duplicate.code = 11000;
          throw duplicate;
        }
        const request = { ...document, _id: new ObjectId() };
        requests.push(request);
        return { insertedId: request._id };
      },
      async updateOne(query, update) {
        const request = requests.find((item) => item._id.equals(query._id) && item.status === query.status);
        if (!request) return { matchedCount: 0 };
        Object.assign(request, update.$set);
        return { matchedCount: 1 };
      },
    },
    request_status_history: {
      async insertOne(document) {
        history.push(document);
        return { insertedId: new ObjectId() };
      },
    },
    emergency_escalations: {
      async insertOne(document) {
        return { insertedId: new ObjectId(), document };
      },
    },
  };

  return {
    requests,
    history,
    collection(name) {
      return collections[name];
    },
  };
}

function invoke(handler, body, getDatabase) {
  const req = { body };
  return new Promise((resolve, reject) => {
    const res = responseRecorder(resolve);
    handler(req, res, (error) => (error ? reject(error) : resolve(res)));
  });
}

test('creates a Sarvam emergency request', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({ getDatabase: () => db, classify: async () => classification() });
  const response = await invoke(handler, requestBody(), () => db);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'escalated_to_112');
  assert.equal(db.requests[0].source_channel, 'sarvam_voice_agent');
  assert.equal(db.requests[0].senior_citizen_phone, '+919999999999');
});

test('rejects an invalid Sarvam emergency payload', async () => {
  let databaseCalled = false;
  const handler = createSarvamEmergencyHandler({ getDatabase: () => { databaseCalled = true; } });
  const response = await invoke(handler, requestBody({ description: '' }));

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(databaseCalled, false);
});

test('rejects placeholder or invented location with 400 Bad Request', async () => {
  let databaseCalled = false;
  const handler = createSarvamEmergencyHandler({ getDatabase: () => { databaseCalled = true; } });
  const response = await invoke(handler, requestBody({ location: 'Unknown Location' }));

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /Placeholder locations/);
  assert.equal(databaseCalled, false);
});

test('rejects a duplicate Sarvam interaction id', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({ getDatabase: () => db, classify: async () => classification() });

  await invoke(handler, requestBody());
  const response = await invoke(handler, requestBody());

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.success, false);
  assert.equal(db.requests.length, 1);
});

test('routine medicine is classified as non-emergency without creating a request', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({
    getDatabase: () => db,
    classify: async () => classification({ is_emergency: false, severity: 'low', disposition: 'non_emergency', reason: 'Routine medication request.' }),
  });
  const response = await invoke(handler, requestBody({ description: 'Need BP medicine tomorrow. No immediate danger.' }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.is_emergency, false);
  assert.equal(db.requests.length, 0);
});

test('creates emergency requests for fire, accident, crime, and safety threats', async () => {
  for (const emergencyType of ['fire', 'accident', 'crime', 'safety_threat']) {
    const db = fakeDatabase();
    const handler = createSarvamEmergencyHandler({
      getDatabase: () => db,
      classify: async () => classification({ emergency_type: emergencyType }),
    });
    const response = await invoke(handler, requestBody({ interaction_id: `interaction-${emergencyType}` }));

    assert.equal(response.statusCode, 201);
    assert.equal(db.requests.length, 1);
  }
});

test('returns unclear without creating an emergency request', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({
    getDatabase: () => db,
    classify: async () => classification({ is_emergency: false, disposition: 'unclear', reason: 'More information is required.' }),
  });
  const response = await invoke(handler, requestBody());

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.disposition, 'unclear');
  assert.equal(db.requests.length, 0);
});

test('rejects an invalid Gemini classification without creating a request', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({ getDatabase: () => db, classify: async () => ({ is_emergency: 'yes' }) });
  const response = await invoke(handler, requestBody());

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.success, false);
  assert.equal(db.requests.length, 0);
});

test('returns a controlled error when Gemini fails without creating a request', async () => {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({
    getDatabase: () => db,
    classify: async () => { throw new GeminiClassificationError('Gemini classification failed.'); },
  });
  const response = await invoke(handler, requestBody());

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.error, 'Gemini classification failed.');
  assert.equal(db.requests.length, 0);
});
