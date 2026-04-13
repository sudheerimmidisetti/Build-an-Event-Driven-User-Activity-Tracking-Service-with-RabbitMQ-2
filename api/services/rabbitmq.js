const amqp = require('amqplib');

const QUEUE = 'user_activity_events';
const DLX = 'user_activity_events_dlx';
const DLQ = 'user_activity_events_dlq';

let channel;
let connection;

/**
 * Establish connection to RabbitMQ and assert the queue.
 * DLX/DLQ arguments must match the consumer's declaration exactly.
 */
async function connect() {
  connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();

  // Set up Dead Letter Exchange and Queue (must match consumer)
  await channel.assertExchange(DLX, 'direct', { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, '');

  // Declare main queue with DLX routing
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': ''
    }
  });
  console.log('Producer connected to RabbitMQ');

  // Auto-reconnect on unexpected closure
  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err.message);
    channel = null;
    connection = null;
  });
  connection.on('close', () => {
    console.warn('RabbitMQ connection closed, will reconnect on next publish');
    channel = null;
    connection = null;
  });
}

/**
 * Publish an event to the queue. Lazily connects if needed.
 */
async function publish(event) {
  if (!channel) await connect();
  channel.sendToQueue(
    QUEUE,
    Buffer.from(JSON.stringify(event)),
    { persistent: true }
  );
}

/**
 * Active health check — verifies the channel is truly alive
 * by querying the queue status on the broker.
 */
async function checkHealth() {
  try {
    if (!channel || !connection) return false;
    await channel.checkQueue(QUEUE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Close channel and connection for graceful shutdown.
 */
async function closeConnection() {
  try { if (channel) await channel.close(); } catch (_) { /* already closed */ }
  try { if (connection) await connection.close(); } catch (_) { /* already closed */ }
}

module.exports = { connect, publish, checkHealth, closeConnection };
