const pool = require('../db');

/**
 * Process the incoming activity event and store it in MySQL.
 * The `id` column is AUTO_INCREMENT — we do not supply it.
 * @param {Object} event The parsed JSON event message
 */
module.exports = async function processActivity(event) {
  const { user_id, event_type, timestamp, metadata } = event;

  const query = `
    INSERT INTO user_activities (user_id, event_type, timestamp, metadata)
    VALUES (?, ?, ?, ?)
  `;

  const dateObj = new Date(timestamp);
  const metadataStr = typeof metadata === 'object' ? JSON.stringify(metadata) : metadata;

  const [result] = await pool.execute(query, [user_id, event_type, dateObj, metadataStr]);
  return result;
};

