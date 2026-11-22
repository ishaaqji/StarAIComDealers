/**
 * Migration runner.
 * Applies numbered SQL files from ./migrations (relative to repo root) in order.
 * Tracks applied migrations in a `schema_migrations` table.
 */
const { pool } = require('../dist/modules/db/connection');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../..', 'migrations');

async function ensureTrackingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  // Idempotent: ensure the tracking column exists on any pre-existing table.
  await pool.query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS filename TEXT UNIQUE`);
}

async function getApplied() {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  await ensureTrackingTable();
  const applied = await getApplied();

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] failed on ${file}:`, err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  if (appliedCount === 0) {
    console.log('[migrate] no new migrations to apply');
  } else {
    console.log(`[migrate] applied ${appliedCount} migration(s)`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
