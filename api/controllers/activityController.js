const Joi = require('joi');
const { publish } = require('../services/rabbitmq');

/**
 * Validation schema for incoming UserActivityEvent.
 * Fields match the spec: user_id (int), event_type (string), timestamp (ISO 8601), metadata (object).
 */
const activitySchema = Joi.object({
  user_id: Joi.number().integer().required(),
  event_type: Joi.string().min(1).max(50).required(),
  timestamp: Joi.string().isoDate().required(),
  metadata: Joi.object().required()
});

exports.createActivity = async (req, res) => {
  // Validate request body
  const { error, value } = activitySchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: error.details[0].message
    });
  }

  // Construct event message (no id — the DB auto-generates it)
  const event = {
    user_id: value.user_id,
    event_type: value.event_type,
    timestamp: value.timestamp,
    metadata: value.metadata
  };

  try {
    // Publish event to RabbitMQ
    await publish(event);

    // Asynchronous acceptance
    return res.status(202).json({
      message: 'Activity event accepted'
    });
  } catch (err) {
    console.error('RabbitMQ publish failed:', err.message);

    return res.status(500).json({
      error: 'Failed to enqueue activity event'
    });
  }
};

