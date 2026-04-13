jest.mock('../services/rabbitmq', () => ({
  connect: jest.fn().mockResolvedValue(true),
  publish: jest.fn(),
  checkHealth: jest.fn().mockReturnValue(true),
  closeConnection: jest.fn().mockResolvedValue(true)
}));

const request = require('supertest');
const app = require('../server');
const { publish } = require('../services/rabbitmq');

describe('POST /api/v1/events/track', () => {

  beforeEach(() => {
    publish.mockClear();
  });

  it('returns 202 and publishes event for valid payload', async () => {
    const res = await request(app)
      .post('/api/v1/events/track')
      .send({
        user_id: 123,
        event_type: 'login',
        timestamp: new Date().toISOString(),
        metadata: { device: 'desktop' }
      });

    expect(res.statusCode).toBe(202);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/events/track')
      .send({
        event_type: 'login'
      });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid data types', async () => {
    const res = await request(app)
      .post('/api/v1/events/track')
      .send({
        user_id: 'not-a-number',
        event_type: 'login',
        timestamp: new Date().toISOString(),
        metadata: { device: 'desktop' }
      });

    expect(res.statusCode).toBe(400);
  });
});
