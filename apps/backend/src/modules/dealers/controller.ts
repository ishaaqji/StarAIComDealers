import { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import { dealerProfileSchema, dealerBrandingSchema, dealerSettingsSchema } from '../shared/schema';
import { requireRole, requireOwnDealer } from '../middleware/auth';

export async function getProfile(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }

  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, slug, name, gstin, address, contact, website_url, ecommerce_type,
                specializations, ai_enabled, local_ai_enabled, status, created_at
         FROM dealers WHERE id = $1`,
        [dealerId]
      );
      const dealer = rows[0];
      if (!dealer) {
        res.status(404).json({ error: 'dealer_not_found' });
        return;
      }

      const [branding, settings] = await Promise.all([
        c.query('SELECT logo_url, primary_color, tagline FROM dealer_branding WHERE dealer_id = $1', [dealerId]),
        c.query('SELECT settings FROM dealer_settings WHERE dealer_id = $1', [dealerId]),
      ]);

      res.json({
        ...dealer,
        branding: branding.rows[0] ?? null,
        settings: settings.rows[0] ?? null,
      });
    });
  } finally {
    client.release();
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }

  const parsed = dealerProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }

  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `UPDATE dealers
         SET name = $1, slug = $2, gstin = $3, address = $4, contact = $5,
             website_url = $6, ecommerce_type = $7, specializations = $8,
             ai_enabled = $9, local_ai_enabled = $10, status = $11
         WHERE id = $12
         RETURNING id, slug, name, gstin, address, contact, website_url, ecommerce_type,
                   specializations, ai_enabled, local_ai_enabled, status`,
        [
          parsed.data.name,
          parsed.data.slug,
          parsed.data.gstin ?? null,
          JSON.stringify(parsed.data.address ?? {}),
          JSON.stringify(parsed.data.contact ?? {}),
          parsed.data.website_url ?? null,
          parsed.data.ecommerce_type ?? null,
          parsed.data.specializations,
          parsed.data.ai_enabled,
          parsed.data.local_ai_enabled,
          parsed.data.status,
          dealerId,
        ]
      );
      res.json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function getBranding(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const { rows } = await pool.query(
    'SELECT logo_url, primary_color, tagline FROM dealer_branding WHERE dealer_id = $1',
    [dealerId]
  );
  res.json(rows[0] ?? null);
}

export async function updateBranding(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = dealerBrandingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO dealer_branding (dealer_id, logo_url, primary_color, tagline)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (dealer_id) DO UPDATE SET logo_url = $2, primary_color = $3, tagline = $4, updated_at = now()
     RETURNING logo_url, primary_color, tagline`,
    [dealerId, parsed.data.logo_url ?? null, parsed.data.primary_color, parsed.data.tagline ?? null]
  );
  res.json(rows[0]);
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const { rows } = await pool.query(
    'SELECT settings FROM dealer_settings WHERE dealer_id = $1',
    [dealerId]
  );
  res.json(rows[0] ?? null);
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = dealerSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO dealer_settings (dealer_id, settings)
     VALUES ($1, $2)
     ON CONFLICT (dealer_id) DO UPDATE SET settings = $2, updated_at = now()
     RETURNING settings`,
    [dealerId, JSON.stringify(parsed.data)]
  );
  res.json(rows[0]);
}

export async function listStaff(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const { rows } = await pool.query(
    `SELECT id, email, role, status, created_at FROM dealer_users WHERE dealer_id = $1 ORDER BY created_at DESC`,
    [dealerId]
  );
  res.json(rows);
}

export async function inviteStaff(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const inviteResult = z
    .object({
      email: z.string().email(),
      role: z.enum(['dealer_admin', 'dealer_staff', 'service_tech']).default('dealer_staff'),
    })
    .safeParse(req.body);
  if (!inviteResult.success) {
    res.status(400).json({ error: 'validation_failed', details: inviteResult.error.flatten() });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { email, role } = inviteResult.data;
    await client.query(
      `INSERT INTO dealer_users (dealer_id, email, name, role, status, invite_token, invite_expires_at)
       VALUES ($1, $2, $3, $4, 'invited', $5, $6)
       ON CONFLICT (dealer_id, email) DO UPDATE SET
         role = EXCLUDED.role,
         status = 'invited',
         invite_token = EXCLUDED.invite_token,
         invite_expires_at = EXCLUDED.invite_expires_at`,
      [dealerId, email, email, role, token, expiresAt]
    );
    await client.query('COMMIT');
    res.status(201).json({
      email,
      role,
      invite_token: token,
      invite_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}`,
      expires_at: expiresAt,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStaff(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const staffId = req.params.staff_id;
  const staffResult = z
    .object({ role: z.enum(['dealer_admin', 'dealer_staff', 'service_tech']).optional(), status: z.enum(['active', 'inactive']).optional() })
    .safeParse(req.body);
  if (!staffResult.success) {
    res.status(400).json({ error: 'validation_failed', details: staffResult.error.flatten() });
    return;
  }
  const sets: string[] = [];
  const params: unknown[] = [dealerId, staffId];
  let idx = 3;
  if (staffResult.data.role) { sets.push(`role = $${idx++}`); params.push(staffResult.data.role); }
  if (staffResult.data.status) { sets.push(`status = $${idx++}`); params.push(staffResult.data.status); }
  if (sets.length === 0) {
    res.status(400).json({ error: 'nothing_to_update' });
    return;
  }
  sets.push(`updated_at = now()`);
  const { rows } = await clientQuery(
    `UPDATE dealer_users SET ${sets.join(', ')} WHERE dealer_id = $1 AND id = $2 RETURNING id, email, role, status, updated_at`,
    params
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'staff_not_found' });
    return;
  }
  res.json(rows[0]);
}

async function clientQuery(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export async function deleteStaff(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const staffId = req.params.staff_id;
  const { rowCount } = await pool.query(
    'DELETE FROM dealer_users WHERE dealer_id = $1 AND id = $2 AND role <> $3',
    [dealerId, staffId, 'dealer_admin']
  );
  if (rowCount === 0) {
    res.status(404).json({ error: 'staff_not_found_or_cannot_delete_admin' });
    return;
  }
  res.status(204).end();
}
