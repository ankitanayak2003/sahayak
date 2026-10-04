const { ObjectId } = require('mongodb');

function activeAssignmentFilter() {
  return {
    $or: [
      { status: 'active' },
      { status: { $exists: false }, expired_at: null },
    ],
  };
}

async function getVolunteerWorkload(db, volunteerId) {
  const assignments = db.collection('request_assignments');
  let active = 0;
  let queued = 0;

  try {
    const activeDoc = await assignments.findOne({
      volunteer_id: volunteerId,
      ...activeAssignmentFilter(),
    });
    if (activeDoc) active = 1;
  } catch (e) {
    active = 0;
  }

  try {
    if (typeof assignments.countDocuments === 'function') {
      queued = await assignments.countDocuments({
        volunteer_id: volunteerId,
        status: 'queued',
      });
    } else if (typeof assignments.find === 'function') {
      const qDocs = await assignments.find({
        volunteer_id: volunteerId,
        status: 'queued',
      }).toArray();
      queued = qDocs ? qDocs.length : 0;
    }
  } catch (e) {
    queued = 0;
  }

  return {
    active,
    queued,
    total: active + queued,
    activeCount: active,
    queuedCount: queued,
    workloadCount: active + queued,
    totalWorkload: active + queued,
  };
}

/**
 * Deterministic Volunteer Selection & Load-Balancing Strategy:
 * 1. Filter: verification_status === 'verified', is_available === true.
 * 2. If users collection is accessible, ensure linked user account_status === 'active'.
 * 3. Count active and queued assignments per candidate volunteer.
 * 4. Sort candidates:
 *    - 1st: Lowest total workload (fewer active + queued emergencies)
 *    - 2nd: Lowest active count (0 active tasks preferred over 1 active task when workload ties)
 *    - 3rd: Deterministic volunteer _id ascending (stable, non-random tie-breaker)
 * 5. Returns chosen volunteer (decorated with workload counts) or null if no eligible volunteer exists.
 */
async function selectEligibleVolunteer(db, request = null, options = {}) {
  const volunteersCollection = db.collection('volunteers');
  const volunteers = await volunteersCollection
    .find({ verification_status: 'verified', is_available: true })
    .sort({ _id: 1 })
    .toArray();

  if (!volunteers || volunteers.length === 0) return null;

  // Filter by linked user account_status === 'active' if users collection is available
  let eligibleVolunteers = volunteers;
  try {
    const usersCollection = db.collection('users');
    if (usersCollection && typeof usersCollection.find === 'function') {
      const userIds = volunteers.map(v => v.user_id).filter(Boolean);
      const activeUsers = await usersCollection.find({
        _id: { $in: userIds },
        account_status: 'active',
      }).toArray();
      const activeUserIds = new Set(activeUsers.map(u => String(u._id)));
      eligibleVolunteers = volunteers.filter(v => activeUserIds.has(String(v.user_id)));
    }
  } catch (error) {
    eligibleVolunteers = volunteers;
  }

  if (eligibleVolunteers.length === 0) return null;

  // Exclude specific volunteer IDs if requested (e.g. volunteer who just rejected)
  if (options.excludeVolunteerIds && options.excludeVolunteerIds.length > 0) {
    const excludeSet = new Set(options.excludeVolunteerIds.map(String));
    eligibleVolunteers = eligibleVolunteers.filter(v => !excludeSet.has(String(v._id)));
    if (eligibleVolunteers.length === 0) return null;
  }

  // Calculate workloads for candidates
  const scored = [];
  for (const vol of eligibleVolunteers) {
    const workload = await getVolunteerWorkload(db, vol._id);
    scored.push({
      volunteer: vol,
      activeCount: workload.active,
      queuedCount: workload.queued,
      totalWorkload: workload.total,
    });
  }

  // If caller specifically requested only unassigned (0 active assignments)
  const candidatePool = options.onlyUnassigned
    ? scored.filter(c => c.activeCount === 0)
    : scored;

  if (candidatePool.length === 0) return null;

  // Deterministic sort:
  // 1. Total workload ASC
  // 2. Active count ASC
  // 3. Volunteer _id ASC
  candidatePool.sort((a, b) => {
    if (a.totalWorkload !== b.totalWorkload) {
      return a.totalWorkload - b.totalWorkload;
    }
    if (a.activeCount !== b.activeCount) {
      return a.activeCount - b.activeCount;
    }
    return String(a.volunteer._id).localeCompare(String(b.volunteer._id));
  });

  const selected = candidatePool[0];
  const volunteer = selected.volunteer;
  volunteer.activeAssignments = selected.activeCount;
  volunteer.queuedAssignments = selected.queuedCount;
  volunteer.totalWorkload = selected.totalWorkload;
  volunteer.hasActiveAssignment = selected.activeCount > 0;

  return volunteer;
}

module.exports = {
  selectEligibleVolunteer,
  getVolunteerWorkload,
};