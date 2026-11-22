import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import { WooCommerceClient } from './client';
import { enqueueSync, woocommerceSyncQueue } from './job';
import {
  woocommerceConnectionSchema,
  woocommerceConnectionResponseSchema,
  woocommerceSyncLogSchema,
  woocommerceWebhookSchema,
  type WooCommerceConnectionInput,
} from './schema';

function maskSecret(secret: string): string {
  if (!secret) return '';
  return secret.length > 4 ? `****${secret.slice(-4)}` : '****';
}

/* ---------- Connections ---------- */

export async function createConnection(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = woocommerceConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deactivate any existing active connection for this dealer
    await client.query(
      `UPDATE woocommerce_connections SET is_active = false, updated_at = now() WHERE dealer_id = $1 AND is_active = true`,
      [dealerId]
    );

    const { rows } = await client.query(
      `INSERT INTO woocommerce_connections (dealer_id, store_url, consumer_key, consumer_secret, api_version, is_active, sync_status)
       VALUES ($1, $2, $3, $4, $5, true, 'idle')
       RETURNING id, dealer_id, store_url, consumer_key, consumer_secret, api_version, is_active, last_sync_at, sync_status, sync_error, created_at, updated_at`,
      [dealerId, parsed.data.store_url, parsed.data.consumer_key, parsed.data.consumer_secret, parsed.data.api_version]
    );

    // Test the connection before committing
    const wc = new WooCommerceClient(parsed.data.store_url, parsed.data.consumer_key, parsed.data.consumer_secret, parsed.data.api_version);
    const test = await wc.testConnection();
    if (!test.ok) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'connection_test_failed', details: test.error });
      return;
    }

    await client.query('COMMIT');

    const conn = rows[0];
    res.status(201).json({
      ...conn,
      consumer_key: maskSecret(conn.consumer_key),
      consumer_secret: undefined,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error', details: err.message });
  } finally {
    client.release();
  }
}

export async function getConnection(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, dealer_id, store_url, consumer_key, consumer_secret, api_version, is_active,
                last_sync_at, sync_status, sync_error, created_at, updated_at
         FROM woocommerce_connections WHERE dealer_id = $1 AND is_active = true`,
        [dealerId]
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'connection_not_found' });
        return;
      }
      const conn = rows[0];
      res.json({
        ...conn,
        consumer_key: maskSecret(conn.consumer_key),
        consumer_secret: undefined,
      });
    });
  } finally {
    client.release();
  }
}

export async function deleteConnection(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE woocommerce_connections SET is_active = false, updated_at = now() WHERE dealer_id = $1 AND is_active = true`,
      [dealerId]
    );
    await client.query('COMMIT');
    if (rowCount === 0) {
      res.status(404).json({ error: 'connection_not_found' });
      return;
    }
    res.status(204).end();
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error', details: err.message });
  } finally {
    client.release();
  }
}

/* ---------- Sync ---------- */

export async function triggerSync(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id FROM woocommerce_connections WHERE dealer_id = $1 AND is_active = true`,
        [dealerId]
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'connection_not_found' });
        return;
      }
      const jobId = await enqueueSync(dealerId, rows[0].id);
      res.json({ job_id: jobId, status: 'queued' });
    });
  } finally {
    client.release();
  }
}

export async function syncStatus(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows: conns } = await c.query(
        `SELECT id, store_url, is_active, last_sync_at, sync_status, sync_error, updated_at
         FROM woocommerce_connections WHERE dealer_id = $1 AND is_active = true`,
        [dealerId]
      );
      if (!conns[0]) {
        res.json({ connected: false, sync_status: 'idle' });
        return;
      }

      const { rows: logs } = await c.query(
        `SELECT id, started_at, completed_at, status, products_fetched, products_upserted, products_skipped, error_message
         FROM woocommerce_sync_logs WHERE connection_id = $1 ORDER BY started_at DESC LIMIT 5`,
        [conns[0].id]
      );

      res.json({
        connected: true,
        connection_id: conns[0].id,
        store_url: conns[0].store_url,
        sync_status: conns[0].sync_status,
        last_sync_at: conns[0].last_sync_at,
        sync_error: conns[0].sync_error,
        recent_logs: logs,
      });
    });
  } finally {
    client.release();
  }
}

/* ---------- Webhook ---------- */

export async function webhook(req: Request, res: Response): Promise<void> {
  const parsed = woocommerceWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }

  const { topic, resource_id } = parsed.data;
  console.log(`[woocommerce-webhook] topic=${topic} resource_id=${resource_id}`);

  // Acknowledge quickly; heavy processing can be queued separately
  res.status(200).json({ received: true });
}

export default {
  createConnection,
  getConnection,
  deleteConnection,
  triggerSync,
  syncStatus,
  webhook,
};
