import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import { loginSchema, refreshSchema } from '../shared/schema';
import { validate } from '../shared/validate';

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

function signAccess(payload: { user_id: string; dealer_id: string | null; role: string }): string {
  return jwt.sign({ ...payload, session_id: crypto.randomUUID() }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  } as SignOptions);
}

function signRefresh(payload: { user_id: string; dealer_id: string | null; role: string }): string {
  return jwt.sign({ ...payload, session_id: crypto.randomUUID() }, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
  } as SignOptions);
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  // Dealer-scoped login: find user by email within their dealer context.
  // platform_admin users live in a separate platform_users table (V2); V1 supports dealer_users only.
  const { rows } = await pool.query(
    `SELECT du.id, du.email, du.password_hash, du.role, du.dealer_id, d.name AS dealer_name
     FROM dealer_users du
     JOIN dealers d ON d.id = du.dealer_id
     WHERE du.email = $1 AND du.status = 'active'`,
    [email]
  );
  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const accessToken = signAccess({
    user_id: user.id,
    dealer_id: user.dealer_id,
    role: user.role,
  });
  const refreshToken = signRefresh({
    user_id: user.id,
    dealer_id: user.dealer_id,
    role: user.role,
  });

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      dealer_id: user.dealer_id,
      dealer_name: user.dealer_name,
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed' });
    return;
  }
  let payload: any;
  try {
    payload = jwt.verify(parsed.data.refresh_token, REFRESH_SECRET);
  } catch {
    res.status(401).json({ error: 'refresh_invalid' });
    return;
  }

  const accessToken = signAccess({
    user_id: payload.user_id,
    dealer_id: payload.dealer_id,
    role: payload.role,
  });
  res.json({ access_token: accessToken });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'authentication_required' });
    return;
  }
  const { rows } = await pool.query(
    `SELECT du.id, du.email, du.role, du.dealer_id, d.name AS dealer_name, d.slug
     FROM dealer_users du
     JOIN dealers d ON d.id = du.dealer_id
     WHERE du.id = $1`,
    [user.user_id]
  );
  const u = rows[0];
  if (!u) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({
    id: u.id,
    email: u.email,
    role: u.role,
    dealer_id: u.dealer_id,
    dealer: { name: u.dealer_name, slug: u.slug },
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  // Public dealer self-registration (creates a new tenant + first admin user).
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed' });
    return;
  }
  const { email, password } = parsed.data;
  const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT id FROM dealer_users WHERE email = $1', [email]);
    if (existing.length) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'email_in_use' });
      return;
    }
    const { rows: dealerRows } = await client.query(
      `INSERT INTO dealers (slug, name, status) VALUES ($1, $2, 'trial') RETURNING id`,
      [slug, email.split('@')[0]]
    );
    const dealerId = dealerRows[0].id;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await client.query(
      `INSERT INTO dealer_users (dealer_id, email, password_hash, role) VALUES ($1, $2, $3, 'dealer_admin')`,
      [dealerId, email, passwordHash]
    );
    await client.query('COMMIT');

    const accessToken = signAccess({ user_id: '', dealer_id: dealerId, role: 'dealer_admin' });
    res.status(201).json({
      access_token: accessToken,
      dealer_id: dealerId,
      message: 'dealer_registered',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default { login, refresh, me, register };
