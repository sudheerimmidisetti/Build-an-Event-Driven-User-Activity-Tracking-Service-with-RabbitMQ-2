jest.mock('../db', () => ({
  execute: jest.fn().mockResolvedValue([{ insertId: 1 }])
}));

const processActivity = require('../services/activityProcessor');
const pool = require('../db');

describe('Activity Processor', () => {
  beforeEach(() => {
    pool.execute.mockClear();
  });

  it('stores activity in MySQL database', async () => {
    const event = {
      user_id: 1,
      event_type: 'login',
      timestamp: new Date().toISOString(),
      metadata: { ip: '127.0.0.1' }
    };

    await processActivity(event);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_activities'),
      expect.arrayContaining([1, 'login', expect.any(Date), '{"ip":"127.0.0.1"}'])
    );
  });

  it('throws on database failure', async () => {
    pool.execute.mockRejectedValueOnce(new Error('DB connection lost'));

    const event = {
      user_id: 2,
      event_type: 'logout',
      timestamp: new Date().toISOString(),
      metadata: {}
    };

    await expect(processActivity(event)).rejects.toThrow('DB connection lost');
  });
});
