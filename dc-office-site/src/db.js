import pg from 'pg';
import { config } from './config.js';

// Railway's Postgres plugin terminates TLS with its own certificate, so
// rejectUnauthorized has to be off for the internal connection string. Local
// Postgres over a plain socket needs no TLS at all.
const needsSsl = /\brailway\b|\bproxy\.rlwy\.net\b|sslmode=require/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});

pool.on('error', (error) => {
  console.error('[db] idle client error', error);
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rsvps (
    day         date        NOT NULL,
    email       text        NOT NULL,
    name        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (day, email)
  );

  CREATE INDEX IF NOT EXISTS rsvps_day_idx ON rsvps (day);

  -- One mirrored all-day event per day on the shared calendar. Storing the
  -- event id is what makes the sync an update rather than a duplicate insert.
  CREATE TABLE IF NOT EXISTS day_events (
    day        date        PRIMARY KEY,
    event_id   text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

export async function initSchema() {
  await pool.query(SCHEMA);
  console.log('[db] schema ready');
}

/**
 * Serialize all work touching one day, across every web process Railway runs.
 * Two people clicking the same Thursday at the same moment would otherwise race
 * on the calendar mirror and could leave a stale title or a duplicate event.
 * Transaction-scoped, so the lock releases on COMMIT or ROLLBACK either way.
 */
export async function withDayLock(dayKey, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`day:${dayKey}`]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
