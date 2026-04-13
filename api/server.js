const express = require('express');
const activityRoutes = require('./routes/activityRoutes');
const { connect, publish, checkHealth, closeConnection } = require('./services/rabbitmq');

const app = express();
app.use(express.json());

app.use('/api/v1', activityRoutes);

app.get('/health', async (req, res) => {
  const isHealthy = await checkHealth();
  if (isHealthy) {
    res.status(200).json({ status: 'OK', rabbitmq: 'connected' });
  } else {
    res.status(503).json({ status: 'UNAVAILABLE', rabbitmq: 'disconnected' });
  }
});

let server;
if (require.main === module) {
  // Eagerly connect to RabbitMQ so the health check works immediately
  connect().catch((err) => console.error('Initial RabbitMQ connection failed:', err.message));

  server = app.listen(process.env.API_PORT || 3000, () => {
    console.log('API running on port', process.env.API_PORT || 3000);
  });

  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    if (server) server.close();
    await closeConnection();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
