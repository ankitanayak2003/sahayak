const { ObjectId } = require('mongodb');
const { decideRequest } = require('./aiDecisionService');
const { createNotification } = require('./notificationService');
const { selectEligibleVolunteer } = require('./volunteerAssignmentService');
const { validateLocationInput } = require('../utils/locationValidation');
const logger = require('../utils/logger');

async function notifySafely(payload) {
  try {
    if (typeof createNotification === 'function') {
      await createNotification(payload);
    }
  } catch (error) {
    logger.warn(`Notification delivery failed: ${error.message}`);
  }
}

const REQUEST_STATUSES = [
  'new',
  'pending_assignment',
  'assigned',
  'accepted',
  'in_progress',
  'queued',
  'completed',
  'cancelled',
  'escalated_to_112',
];

const ALLOWED_TRANSITIONS = {
  new: ['assigned', 'queued'],
  pending_assignment: ['assigned', 'queued', 'escalated_to_112', 'cancelled'],
  assigned: ['accepted', 'cancelled', 'escalated_to_112', 'pending_assignment'],
  accepted: ['in_progress', 'cancelled', 'escalated_to_112'],
  in_progress: ['completed', 'cancelled', 'escalated_to_112'],
  queued: ['assigned', 'pending_assignment', 'cancelled', 'escalated_to_112'],
  escalated_to_112: ['completed'],
};

let activeAssignmentIndexPromise;

function activeAssignmentFilter() {
  return {
    $or: [
      { status: 'active' },
      { status: { $exists: false }, expired_at: null },
    ],
  };
}

function activeAssignmentQuery(volunteerId) {
  return {
    volunteer_id: volunteerId,
    ...activeAssignmentFilter(),
  };
}

async function ensureActiveAssignmentIndex(db) {
  const assignments = db.collection('request_assignments');
  if (typeof assignments.createIndex !== 'function') return;
  if (!activeAssignmentIndexPromise) {
    activeAssignmentIndexPromise = assignments.createIndex(
      { volunteer_id: 1 },
      {
        name: 'uniq_active_volunteer_assignment',
        unique: true,
        partialFilterExpression: { status: 'active' },
      }
    ).catch((error) => {
      activeAssignmentIndexPromise = null;
      throw error;
    });
  }
  await activeAssignmentIndexPromise;
}

async function hasActiveAssignment(db, volunteerId) {
  return Boolean(await db.collection('request_assignments').findOne(activeAssignmentQuery(volunteerId)));
}

async function notifySafely(notification) {
  try {
    await createNotification(notification);
  } catch (error) {
    logger.warn(`Notification delivery skipped: ${error.message}`);
  }
}

function requestError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function actorId(actor) {
  if (!actor?.id) return null;
  if (actor.id instanceof ObjectId) return actor.id;
  if (typeof actor.id === 'string' && ObjectId.isValid(actor.id)) return new ObjectId(actor.id);
  return null;
}

async function addHistory(db, requestId, { action, status, previousState = null, newState = null, actor, reason, metadata }) {
  const userId = actorId(actor);
  await db.collection('request_status_history').insertOne({
    request_id: requestId,
    action,
    status: status || null,
    previous_state: previousState,
    new_state: newState,
    performed_by: userId,
    performed_by_role: actor?.role || null,
    changed_by: userId,
    reason: reason || null,
    metadata: metadata || null,
    created_at: new Date(),
  });
}

async function createEmergencyEscalation(db, request, escalationType, notes, timestamp) {
  return db.collection('emergency_escalations').insertOne({
    request_id: request._id,
    senior_citizen_id: request.senior_citizen_id || null,
    escalation_type: escalationType || request.category,
    notes: notes || '',
    escalated_to: '112',
    acknowledged_by: null,
    acknowledged_at: null,
    resolution_status: 'open',
    created_at: timestamp,
    updated_at: timestamp,
  });
}

/**
 * Promotes the next queued assignment for a volunteer to active/assigned status
 */
async function promoteNextQueuedAssignment(db, volunteerId, actor = null) {
  if (!volunteerId) return null;
  const assignmentsCollection = db.collection('request_assignments');
  const requestsCollection = db.collection('assistance_requests');
  const timestamp = new Date();

  let nextAssignment = null;
  if (typeof assignmentsCollection.find === 'function') {
    const queuedDocs = await assignmentsCollection
      .find({ volunteer_id: volunteerId, status: 'queued' })
      .sort({ queue_position: 1, assigned_at: 1 })
      .toArray();
    if (queuedDocs && queuedDocs.length > 0) nextAssignment = queuedDocs[0];
  } else if (typeof assignmentsCollection.findOne === 'function') {
    nextAssignment = await assignmentsCollection.findOne(
      { volunteer_id: volunteerId, status: 'queued' },
      { sort: { queue_position: 1, assigned_at: 1 } }
    );
  }

  if (!nextAssignment) return null;

  await ensureActiveAssignmentIndex(db);

  // Promote assignment from queued to active
  await assignmentsCollection.updateOne(
    { _id: nextAssignment._id },
    { $set: { status: 'active', queue_position: 1, promoted_at: timestamp } }
  );

  // Transition the request from queued to assigned
  await requestsCollection.updateOne(
    { _id: nextAssignment.request_id, status: 'queued' },
    { $set: { status: 'assigned', queue_position: 1, updated_at: timestamp } }
  );

  // Add status history
  await addHistory(db, nextAssignment.request_id, {
    action: 'REQUEST_ASSIGNED',
    status: 'assigned',
    previousState: 'queued',
    newState: 'assigned',
    actor,
    reason: 'Promoted to active assignment following completion of prior incident.',
    metadata: { promoted_from_queue: true, volunteer_id: volunteerId },
  });

  // Re-index remaining queued assignments for this volunteer
  try {
    if (typeof assignmentsCollection.find === 'function') {
      const remaining = await assignmentsCollection
        .find({ volunteer_id: volunteerId, status: 'queued', _id: { $ne: nextAssignment._id } })
        .sort({ queue_position: 1, assigned_at: 1 })
        .toArray();
      let pos = 2;
      for (const rem of remaining) {
        await assignmentsCollection.updateOne({ _id: rem._id }, { $set: { queue_position: pos } });
        await requestsCollection.updateOne({ _id: rem.request_id, status: 'queued' }, { $set: { queue_position: pos } });
        pos++;
      }
    }
  } catch (e) {
    // Non-critical reindexing
  }

  // Notify volunteer
  try {
    const vol = await db.collection('volunteers').findOne({ _id: volunteerId });
    if (vol?.user_id) {
      await notifySafely({
        recipientUserId: vol.user_id,
        message: 'Your next queued emergency is now active and ready for dispatch.',
      });
    }
  } catch {}

  return nextAssignment;
}

async function transitionRequest(db, requestId, nextStatus, actor, options = {}) {
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) throw requestError('Request not found.', 404);

  if (!REQUEST_STATUSES.includes(nextStatus) || !ALLOWED_TRANSITIONS[request.status]?.includes(nextStatus)) {
    throw requestError('Invalid request state transition.');
  }

  const timestamp = new Date();
  const update = { status: nextStatus, updated_at: timestamp };

  if (nextStatus === 'assigned') {
    if (!options.volunteerId) throw requestError('A volunteer is required for assignment.');
    await ensureActiveAssignmentIndex(db);
    if (await hasActiveAssignment(db, options.volunteerId)) {
      throw requestError('Volunteer is already handling another active request.');
    }
    update.current_assigned_volunteer_id = options.volunteerId;
    update.assigned_at = timestamp;
    update.queue_position = 1;
  }

  if (nextStatus === 'queued') {
    if (!options.volunteerId) throw requestError('A volunteer is required for queueing.');
    update.current_assigned_volunteer_id = options.volunteerId;
    update.assigned_at = timestamp;
    let qPos = options.queuePosition;
    if (qPos == null) {
      try {
        const queuedCount = await db.collection('request_assignments').countDocuments({
          volunteer_id: options.volunteerId,
          status: 'queued',
        });
        qPos = queuedCount + 2;
      } catch {
        try {
          const qDocs = await db.collection('request_assignments').find({
            volunteer_id: options.volunteerId,
            status: 'queued',
          }).toArray();
          qPos = (qDocs ? qDocs.length : 0) + 2;
        } catch {
          qPos = 2;
        }
      }
    }
    update.queue_position = qPos;
  }

  if (nextStatus === 'accepted') update.accepted_at = timestamp;

  let assignmentId;
  if (nextStatus === 'assigned') {
    try {
      const assignment = await db.collection('request_assignments').insertOne({
        request_id: requestId,
        volunteer_id: options.volunteerId,
        status: 'active',
        queue_position: 1,
        assigned_at: timestamp,
        accepted_at: null,
        expired_at: null,
      });
      assignmentId = assignment.insertedId;
    } catch (error) {
      if (error.code === 11000) throw requestError('Volunteer is already handling another active request.');
      throw error;
    }
  } else if (nextStatus === 'queued') {
    const assignment = await db.collection('request_assignments').insertOne({
      request_id: requestId,
      volunteer_id: options.volunteerId,
      status: 'queued',
      queue_position: update.queue_position,
      assigned_at: timestamp,
      accepted_at: null,
      expired_at: null,
    });
    assignmentId = assignment.insertedId;
  }

  const result = await db.collection('assistance_requests').updateOne(
    { _id: requestId, status: request.status },
    { $set: update }
  );

  if (!result.matchedCount) {
    if (assignmentId) {
      await db.collection('request_assignments').updateOne(
        { _id: assignmentId },
        { $set: { status: 'expired', expired_at: timestamp } }
      );
    }
    throw requestError('Request state changed; please retry.');
  }

  if (nextStatus === 'accepted') {
    const assignments = db.collection('request_assignments');
    if (assignments && typeof assignments.updateOne === 'function') {
      await assignments.updateOne(
        { request_id: requestId, volunteer_id: request.current_assigned_volunteer_id, accepted_at: null, expired_at: null },
        { $set: { accepted_at: timestamp } }
      );
    }
  } else if (['completed', 'cancelled', 'escalated_to_112'].includes(nextStatus)) {
    const assignments = db.collection('request_assignments');
    if (assignments) {
      const updateFn = typeof assignments.updateMany === 'function'
        ? assignments.updateMany.bind(assignments)
        : typeof assignments.updateOne === 'function'
          ? assignments.updateOne.bind(assignments)
          : null;

      if (updateFn) {
        const statusMap = {
          completed: 'completed',
          cancelled: 'cancelled',
          escalated_to_112: 'escalated',
        };
        const setFields = { status: statusMap[nextStatus], expired_at: timestamp };
        if (nextStatus === 'completed') setFields.completed_at = timestamp;

        await updateFn(
          { request_id: requestId, ...activeAssignmentFilter() },
          { $set: setFields }
        );
      }
    }

    // When an active incident is completed, promote next queued emergency for that volunteer
    if (nextStatus === 'completed' && request.current_assigned_volunteer_id) {
      await promoteNextQueuedAssignment(db, request.current_assigned_volunteer_id, actor);
    }
  }

  await addHistory(db, requestId, {
    action: nextStatus === 'escalated_to_112'
      ? 'REQUEST_ESCALATED'
      : nextStatus === 'queued'
      ? 'REQUEST_QUEUED'
      : `REQUEST_${nextStatus.toUpperCase()}`,
    status: nextStatus,
    previousState: request.status,
    newState: nextStatus,
    actor,
    reason: options.reason || 'Request status updated.',
    metadata: options.metadata,
  });

  if (nextStatus === 'assigned' && options.volunteerUserId) {
    await notifySafely({ recipientUserId: options.volunteerUserId, message: 'A request has been assigned to you.' });
  } else if (nextStatus === 'queued' && options.volunteerUserId) {
    await notifySafely({ recipientUserId: options.volunteerUserId, message: `Emergency added to your dispatch queue (Position #${update.queue_position}).` });
  } else if (request.created_by) {
    await notifySafely({ recipientUserId: request.created_by, message: `Request status changed to ${nextStatus}.` });
  }

  if (nextStatus === 'escalated_to_112') {
    await createEmergencyEscalation(db, request, options.escalationType, options.notes, timestamp);
  }

  return { ...request, ...update, _id: requestId };
}

/**
 * Assigns or queues an emergency to a specific volunteer based on their current active workload
 */
async function assignOrQueueVolunteer(db, requestId, volunteerId, actor, options = {}) {
  const hasActive = await hasActiveAssignment(db, volunteerId);
  const targetStatus = hasActive ? 'queued' : 'assigned';
  return transitionRequest(db, requestId, targetStatus, actor, {
    volunteerId,
    ...options,
  });
}

/**
 * Automatic dispatch of a pending_assignment emergency to the best eligible volunteer
 */
async function autoAssignRequest(db, requestId, actor = null, options = {}) {
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return null;
  if (request.status !== 'pending_assignment') return null;

  const selected = await selectEligibleVolunteer(db, request, options);
  if (!selected) {
    await db.collection('assistance_requests').updateOne(
      { _id: requestId, status: 'pending_assignment' },
      { $set: { unassigned_reason: 'Waiting for available responder', updated_at: new Date() } }
    );
    return { success: false, status: 'pending_assignment', message: 'Waiting for available responder' };
  }

  const volunteerId = selected._id;
  const result = await assignOrQueueVolunteer(db, requestId, volunteerId, actor, {
    volunteerUserId: selected.user_id,
    reason: options.reason || (selected.hasActiveAssignment
      ? 'Automatically placed in volunteer dispatch queue.'
      : 'Assigned by automatic dispatch.'),
    metadata: { volunteer_id: volunteerId, automatic: true, ...(options.metadata || {}) },
  });

  return {
    success: true,
    volunteerId,
    status: result.status,
    queuePosition: result.queue_position || 1,
    request: result,
  };
}

async function rejectAssignment(db, requestId, volunteerId, actor) {
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) throw requestError('Request not found.', 404);
  if (request.status !== 'assigned' || String(request.current_assigned_volunteer_id) !== String(volunteerId)) {
    throw requestError('Volunteer is not the currently assigned volunteer.');
  }

  const timestamp = new Date();
  const result = await db.collection('assistance_requests').updateOne(
    { _id: requestId, status: 'assigned', current_assigned_volunteer_id: volunteerId },
    { $set: { status: 'pending_assignment', current_assigned_volunteer_id: null, queue_position: null, updated_at: timestamp } }
  );
  if (!result.matchedCount) throw requestError('Request state changed; please retry.');

  await db.collection('request_assignments').updateOne(
    { request_id: requestId, volunteer_id: volunteerId, $or: [{ status: 'active' }, { status: { $exists: false }, expired_at: null }] },
    { $set: { status: 'rejected', expired_at: timestamp, rejected_at: timestamp } }
  );
  await addHistory(db, requestId, {
    action: 'REQUEST_REJECTED',
    status: 'pending_assignment',
    previousState: 'assigned',
    newState: 'pending_assignment',
    actor,
    reason: 'Rejected by assigned volunteer.',
  });

  if (request.created_by) {
    await notifySafely({ recipientUserId: request.created_by, message: 'The assigned volunteer rejected the request.' });
  }

  // Promote next queued emergency for this volunteer if one exists
  await promoteNextQueuedAssignment(db, volunteerId, actor);

  // Automatically attempt reassignment of the rejected request to another eligible volunteer
  try {
    await autoAssignRequest(db, requestId, actor, {
      excludeVolunteerIds: [volunteerId],
      reason: 'Reassigned automatically following volunteer decline.',
    });
  } catch (e) {
    // Non-fatal if no other volunteer is available
  }

  return { ...request, status: 'pending_assignment', current_assigned_volunteer_id: null, updated_at: timestamp, _id: requestId };
}

/**
 * Handles volunteer availability toggle (on-duty / off-duty)
 * - When going off-duty: preserves in_progress/accepted tasks; reassigns unaccepted/queued tasks to other volunteers
 * - When going on-duty: automatically dispatches any waiting requests in pending_assignment
 */
async function handleVolunteerAvailabilityChange(db, volunteerId, isAvailable, actor = null) {
  const timestamp = new Date();
  const assignmentsCollection = db.collection('request_assignments');
  const requestsCollection = db.collection('assistance_requests');

  if (!isAvailable) {
    // Find queued assignments OR active assignments that are still in 'assigned' (not accepted yet)
    let reassignableAssignments = [];
    if (typeof assignmentsCollection.find === 'function') {
      reassignableAssignments = await assignmentsCollection.find({
        volunteer_id: volunteerId,
        $or: [{ status: 'queued' }, { status: 'active' }],
      }).toArray();
    }

    for (const assignment of reassignableAssignments) {
      const linkedRequest = await requestsCollection.findOne({ _id: assignment.request_id });
      if (!linkedRequest) continue;

      // Preserve active work that is already accepted or in_progress!
      if (['accepted', 'in_progress', 'completed', 'cancelled', 'escalated_to_112'].includes(linkedRequest.status)) {
        continue;
      }

      // Reassign queued or unaccepted assigned requests
      await assignmentsCollection.updateOne(
        { _id: assignment._id },
        { $set: { status: 'reassigned', expired_at: timestamp, reason: 'Volunteer marked off-duty' } }
      );

      await requestsCollection.updateOne(
        { _id: linkedRequest._id },
        {
          $set: {
            status: 'pending_assignment',
            current_assigned_volunteer_id: null,
            queue_position: null,
            unassigned_reason: 'Volunteer went off duty / unavailable',
            updated_at: timestamp,
          },
        }
      );

      await addHistory(db, linkedRequest._id, {
        action: 'REQUEST_UNASSIGNED',
        status: 'pending_assignment',
        previousState: linkedRequest.status,
        newState: 'pending_assignment',
        actor,
        reason: 'Volunteer went off duty; emergency returned to dispatch pool.',
      });

      // Try assigning to another eligible volunteer who is on duty
      try {
        await autoAssignRequest(db, linkedRequest._id, actor, {
          excludeVolunteerIds: [volunteerId],
          reason: 'Reassigned after previous responder went off-duty.',
        });
      } catch (err) {
        // Non-fatal
      }
    }
  } else {
    // When volunteer goes ON DUTY: Check if any requests are waiting in pending_assignment
    try {
      if (typeof requestsCollection.find === 'function') {
        const waitingRequests = await requestsCollection
          .find({ status: 'pending_assignment' })
          .sort({ created_at: 1 })
          .toArray();

        for (const req of waitingRequests) {
          await autoAssignRequest(db, req._id, actor, {
            reason: 'Assigned as responder became on-duty.',
          });
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }
}

async function createRequest(db, data, actor = null) {
  const timestamp = new Date();
  const decision = decideRequest({ ...data, urgency_level: data.urgencyLevel });

  // Validate location input (coordinates, accuracy, source)
  const locationValidation = validateLocationInput(data);
  if (!locationValidation.valid) {
    throw requestError(locationValidation.error, 400);
  }
  const loc = locationValidation.hasCoordinates ? locationValidation.location : null;

  const request = {
    ...data.extraFields,
    senior_citizen_id: data.seniorCitizenId || null,
    senior_citizen_phone: data.seniorCitizenPhone || null,
    category: data.category,
    urgency_level: data.urgencyLevel,
    is_emergency: Boolean(data.isEmergency || data.extraFields?.is_emergency || decision.emergency),
    ai_confidence: data.aiConfidence == null ? null : Number(data.aiConfidence),
    description: data.description || '',
    location_text: data.locationText || data.location || null,
    latitude: loc ? loc.latitude : null,
    longitude: loc ? loc.longitude : null,
    accuracy_meters: loc ? loc.accuracy_meters : null,
    location_source: loc ? loc.location_source : (data.location_source || data.locationSource || 'caller_provided'),
    location_captured_at: loc ? loc.location_captured_at : null,
    location_geojson: loc ? loc.geojson : null,
    source_channel: data.sourceChannel || 'app',
    status: 'pending_assignment',
    current_assigned_volunteer_id: null,
    created_by: actorId(actor) || data.requester || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const result = await db.collection('assistance_requests').insertOne(request);
  request._id = result.insertedId;
  request.request_id = result.insertedId;
  if (typeof db.collection('assistance_requests').updateOne === 'function') {
    try {
      await db.collection('assistance_requests').updateOne(
        { _id: result.insertedId },
        { $set: { request_id: result.insertedId } }
      );
    } catch {
      // non-fatal
    }
  }
  await addHistory(db, result.insertedId, {
    action: 'REQUEST_CREATED',
    status: 'pending_assignment',
    newState: 'pending_assignment',
    actor,
    reason: data.creationReason || 'Request created.',
    metadata: { emergency: decision.emergency, ...(data.metadata || {}) },
  });

  if (decision.emergency) {
    await transitionRequest(db, result.insertedId, 'escalated_to_112', actor, {
      escalationType: data.escalationType,
      reason: data.escalationReason || 'Critical request escalated for emergency response.',
      metadata: { emergency: true, ...(data.metadata || {}) },
    });
    return { ...request, status: 'escalated_to_112' };
  }

  // Automatic emergency assignment for requests entering pending_assignment
  try {
    const autoResult = await autoAssignRequest(db, result.insertedId, actor, {
      reason: 'Automatically dispatched upon emergency creation.',
    });
    if (autoResult?.success) {
      request.status = autoResult.status;
      request.current_assigned_volunteer_id = autoResult.volunteerId;
      request.queue_position = autoResult.queuePosition;
    }
  } catch (err) {
    logger.warn(`Auto-assignment on createRequest deferred: ${err.message}`);
  }

  return { ...request, status: request.status };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  REQUEST_STATUSES,
  addHistory,
  assignOrQueueVolunteer,
  autoAssignRequest,
  createRequest,
  handleVolunteerAvailabilityChange,
  hasActiveAssignment,
  promoteNextQueuedAssignment,
  rejectAssignment,
  transitionRequest,
};
