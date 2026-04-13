const mysql = require('mysql2/promise');

/**
 * Parse the DATABASE_URL environment variable into mysql2 pool options.
 * Expected format: mysql://user:password@host:port/database
 */
function parseDbUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace('/', '')
  };
}

const pool = mysql.createPool({
  ...parseDbUrl(process.env.DATABASE_URL),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
