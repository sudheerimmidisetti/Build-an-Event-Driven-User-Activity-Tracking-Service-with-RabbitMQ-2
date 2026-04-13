const amqp = require('amqplib');
const express = require('express');
const pool = require('./db');
const processActivity = require('./services/activityProcessor');

const app = express();
const PORT = process.env.PORT || 3001;

const QUEUE = 'user_activity_events';
const DLX = 'user_activity_events_dlx';
const DLQ = 'user_activity_events_dlq';
const MAX_RETRIES = 3;

let rabbitChannel;
let rabbitConnection;
let expressServer;
let isShuttingDown = false;
let activeProcessing = 0; // Track in-flight messages

async function startWorker() {
  try {
    rabbitConnection = await amqp.connect(process.env.RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();

    // Auto-reconnect on unexpected closure
    rabbitConnection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
      rabbitChannel = null;
      rabbitConnection = null;
    });
    rabbitConnection.on('close', () => {
      console.warn('RabbitMQ connection closed unexpectedly');
      rabbitChannel = null;
      rabbitConnection = null;
      if (!isShuttingDown) {
        console.log('Attempting reconnect in 5s...');
        setTimeout(() => startWorker().catch(console.error), 5000);
      }
    });

    // 1. Set up Dead Letter Exchange and Queue
    await rabbitChannel.assertExchange(DLX, 'direct', { durable: true });
    await rabbitChannel.assertQueue(DLQ, { durable: true });
    await rabbitChannel.bindQueue(DLQ, DLX, '');

    // 2. Declare main queue with dead-letter routing
    await rabbitChannel.assertQueue(QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX,
        'x-dead-letter-routing-key': ''
      }
    });

    // Only process one message at a time (back-pressure)
    await rabbitChannel.prefetch(1);

    console.log('🟢 Worker waiting for messages...');

    rabbitChannel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      activeProcessing++;

      // Step 1: Parse the message (permanent failure if malformed)
      let event;
      try {
        event = JSON.parse(msg.content.toString());
      } catch (parseErr) {
        console.error('❌ Malformed message (not valid JSON):', parseErr.message);
        // Permanent failure → send to DLQ, never retry
        rabbitChannel.nack(msg, false, false);
        activeProcessing--;
        return;
      }

      // Step 2: Process the event (transient failures get retried)
      try {
        await processActivity(event);
        rabbitChannel.ack(msg); // ✅ Acknowledge successful processing
      } catch (dbErr) {
        const retryCount = (msg.properties.headers && msg.properties.headers['x-retry-count']) || 0;

        if (retryCount < MAX_RETRIES) {
          console.warn(`⚠️ Processing failed (retry ${retryCount + 1}/${MAX_RETRIES}):`, dbErr.message);
          // Republish with incremented retry count for transient errors
          rabbitChannel.sendToQueue(QUEUE, msg.content, {
            persistent: true,
            headers: { 'x-retry-count': retryCount + 1 }
          });
          rabbitChannel.ack(msg); // Ack the original to avoid duplicates
        } else {
          console.error('❌ Max retries reached, sending to DLQ:', dbErr.message);
          // Exhausted retries → nack without requeue → goes to DLQ via DLX
          rabbitChannel.nack(msg, false, false);
        }
      }

      activeProcessing--;
    });
  } catch (err) {
    console.error('RabbitMQ connection error on startup:', err.message);
    if (!isShuttingDown) {
      console.log('Retrying connection in 5s...');
      setTimeout(() => startWorker().catch(console.error), 5000);
    }
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    // Check RabbitMQ
    if (!rabbitChannel) throw new Error('Rabbit channel not ready');
    // Check MySQL
    await pool.query('SELECT 1');

    res.status(200).json({ status: 'OK', rabbitmq: 'connected', mysql: 'connected' });
  } catch (error) {
    console.error('Health check failed', error);
    res.status(503).json({ status: 'UNAVAILABLE', error: error.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

expressServer = app.listen(PORT, () => {
  console.log(`Consumer health check server running on port ${PORT}`);
  startWorker().catch(console.error);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  // 1. Stop accepting new HTTP requests
  try { if (expressServer) await new Promise((resolve) => expressServer.close(resolve)); } catch (_) { /* ignore */ }

  // 2. Stop consuming new messages
  try { if (rabbitChannel) await rabbitChannel.cancel(QUEUE); } catch (_) { /* ignore */ }

  // 3. Wait for in-flight messages to finish (max 10 seconds)
  const drainStart = Date.now();
  while (activeProcessing > 0 && Date.now() - drainStart < 10000) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (activeProcessing > 0) {
    console.warn(`⚠️ Forcing shutdown with ${activeProcessing} messages still processing`);
  }

  // 4. Close connections (broker → database)
  try { if (rabbitChannel) await rabbitChannel.close(); } catch (_) { /* ignore */ }
  try { if (rabbitConnection) await rabbitConnection.close(); } catch (_) { /* ignore */ }
  try { if (pool) await pool.end(); } catch (_) { /* ignore */ }

  console.log('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
