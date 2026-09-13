const { Pool } = require('pg');

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Postgres/Supabase connection string.');
}

// Prefer the direct (unpooled) connection string when one is available
// (Neon provides both). A transaction-mode pooler can hand different
// queries on the *same* client-side connection to different physical
// backend sessions -- so a `SET search_path` issued at connect time isn't
// guaranteed to still be in effect for a later query, which silently
// leaks one app's schema isolation into another's when several apps share
// one pooled database. The direct connection keeps one real session per
// pool client for its whole lifetime, so the SET below actually sticks.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  // Direct (unpooled) Postgres connections are a much scarcer resource than
  // pooled ones -- keep this small since several apps may share one Neon
  // project's direct-connection budget.
  max: Number(process.env.DB_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 10 * 60 * 1000),
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error('PostgreSQL pool error:', err.message));

// DB_SCHEMA lets multiple apps share one physical Postgres database
// without their tables colliding (two apps both wanting a plain "users"
// table, say) -- each app gets its own schema/namespace. Defaults to
// "public" so a dedicated database (the common case) needs no extra config.
const SCHEMA = process.env.DB_SCHEMA || 'public';

// Reports and dashboards filter with `created_at::date = $1`, which is
// evaluated in the session's timezone -- if that isn't UTC (the host's
// default, or Supabase's), a sale near midnight can land on the "wrong"
// day and silently drop out of "today's" totals. Pin every connection to
// UTC so date math is consistent regardless of where this runs. Also pins
// search_path to this app's schema so every query -- including ones this
// file didn't write, like connect-pg-simple's session table -- lands in
// the right place.
pool.on('connect', client => {
  client.query("SET TIME ZONE 'UTC'").catch(e => console.error('Failed to set session timezone:', e.message));
  if (SCHEMA !== 'public') {
    client.query(`SET search_path TO "${SCHEMA}", public`).catch(e => console.error('Failed to set search_path:', e.message));
  }
});

// Self-healing schema: every statement in schema.sql is CREATE ... IF NOT
// EXISTS / INSERT ... ON CONFLICT DO NOTHING, so re-running it is always a
// no-op once the schema is current -- safe to call on every boot.
pool.ensureSchema = async function ensureSchema() {
  const fs = require('fs');
  const path = require('path');
  if (SCHEMA !== 'public') {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
};

module.exports = pool;
