const { getDB } = require('../config/mongodb');

async function createNotification({ recipientUserId, type = 'system', message }) {
  if (!recipientUserId || !message) return null;

  const now = new Date();
  const notification = {
    recipient_user_id: recipientUserId,
    type,
    message,
    status: 'pending',
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  };

  const result = await getDB().collection('notifications').insertOne(notification);
  return { ...notification, _id: result.insertedId };
}

module.exports = { createNotification };
