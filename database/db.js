const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Postgres/Supabase connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 10 * 60 * 1000),
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error('PostgreSQL pool error:', err.message));

// Reports and dashboards filter with `created_at::date = $1`, which is
// evaluated in the session's timezone -- if that isn't UTC (the host's
// default, or Supabase's), a sale near midnight can land on the "wrong"
// day and silently drop out of "today's" totals. Pin every connection to
// UTC so date math is consistent regardless of where this runs.
pool.on('connect', client => {
  client.query("SET TIME ZONE 'UTC'").catch(e => console.error('Failed to set session timezone:', e.message));
});

// Self-healing schema: every statement in schema.sql is CREATE ... IF NOT
// EXISTS / INSERT ... ON CONFLICT DO NOTHING, so re-running it is always a
// no-op once the schema is current -- safe to call on every boot.
pool.ensureSchema = async function ensureSchema() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
};

module.exports = pool;
