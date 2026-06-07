const db = require('../config/db');

const createNotification = async (userId, title, message, type = 'system', referenceId = null) => {
  try {
    await db.execute(
      'INSERT INTO notifications (user_id, title, message, type, reference_id) VALUES (?, ?, ?, ?, ?)',
      [userId, title, message, type, referenceId]
    );
  } catch (err) {
    console.error('Notification creation error:', err.message);
  }
};

module.exports = { createNotification };
