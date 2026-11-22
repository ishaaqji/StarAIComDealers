import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
console.log('[db] env:', { host: !!process.env.DB_HOST, port: !!process.env.DB_PORT, user: !!process.env.DB_USER, pass: !!process.env.DB_PASSWORD, db: !!process.env.DB_NAME });

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'starai',
  password: process.env.DB_PASSWORD || 'starai_dev_pass',
  database: process.env.DB_NAME || 'starai',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  // no-op; kept for observability hooks
});

pool.on('error', (err) => {
  console.error('Unexpected postgres client error', err);
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('executed query', { text: text.substring(0, 60), duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient() {
  return pool.connect();
}

export async function closePool() {
  await pool.end();
}
