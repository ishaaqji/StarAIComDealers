import { Queue, Worker, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import { WooCommerceClient } from './client';
import { WooCommerceProduct } from './schema';

const QUEUE_NAME = 'woocommerce-sync';
const REDIS_CONN = { host: 'localhost', port: 6379 };

export const woocommerceSyncQueue = new Queue(QUEUE_NAME, { connection: REDIS_CONN });

/* ---------- Job producer ---------- */

export async function enqueueSync(dealerId: string, connectionId: string): Promise<string> {
  const job = await woocommerceSyncQueue.add(
    'sync-products',
    { dealerId, connectionId },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 }
  );
  return job.id!;
}

/* ---------- Worker ---------- */

export function startWoocommerceSyncWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<{ dealerId: string; connectionId: string }>) => {
      const { dealerId, connectionId } = job.data;
      const client = await pool.connect();
      try {
        await withDealerContext(client, dealerId, async (c) => {
          // Mark syncing
          await c.query(
            `UPDATE woocommerce_connections SET sync_status = 'syncing', sync_error = NULL, updated_at = now() WHERE id = $1`,
            [connectionId]
          );

          // Fetch connection
          const { rows: conns } = await c.query(
            `SELECT store_url, consumer_key, consumer_secret, api_version FROM woocommerce_connections WHERE id = $1 AND dealer_id = $2`,
            [connectionId, dealerId]
          );
          if (!conns[0]) throw new Error('WooCommerce connection not found');

          const wc = new WooCommerceClient(conns[0].store_url, conns[0].consumer_key, conns[0].consumer_secret, conns[0].api_version);

          const logId = randomUUID();
          await c.query(
            `INSERT INTO woocommerce_sync_logs (id, dealer_id, connection_id, started_at, status) VALUES ($1, $2, $3, now(), 'success')`,
            [logId, dealerId, connectionId]
          );

          let fetched = 0;
          let upserted = 0;
          let page = 1;
          let totalPages = 1;

          while (page <= totalPages) {
            const { data, totalPages: tp, total } = await wc.getProducts({ page, per_page: 100 });
            totalPages = tp;
            fetched += data.length;

            for (const p of data) {
              const wcProduct = p as WooCommerceProduct;
              const primaryCategory = wcProduct.categories?.[0]?.id;
              const sku = wcProduct.sku || `wc-${wcProduct.id}`;
              const images = wcProduct.images?.map((img: any) => img.src) ?? [];
              const tags = wcProduct.tags?.map((t: any) => t.name) ?? [];
              const price = parseFloat(wcProduct.price) || 0;
              const regularPrice = wcProduct.regular_price ? parseFloat(wcProduct.regular_price) : null;
              const salePrice = wcProduct.sale_price ? parseFloat(wcProduct.sale_price) : null;
              const sellingPrice = salePrice ?? regularPrice ?? price;
              const mrp = regularPrice ?? null;
              const stockQty = wcProduct.stock_quantity ?? 0;

              await c.query(
                `INSERT INTO products (dealer_id, sku, name, brand, category_id, description, specs, images,
                            purchase_price, selling_price, mrp, stock_qty, warranty_months,
                            product_url, tags, status, ai_featured)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                 ON CONFLICT (dealer_id, sku) DO UPDATE SET
                   name = EXCLUDED.name,
                   brand = EXCLUDED.brand,
                   category_id = EXCLUDED.category_id,
                   description = EXCLUDED.description,
                   specs = EXCLUDED.specs,
                   images = EXCLUDED.images,
                   selling_price = EXCLUDED.selling_price,
                   mrp = EXCLUDED.mrp,
                   stock_qty = EXCLUDED.stock_qty,
                   warranty_months = EXCLUDED.warranty_months,
                   tags = EXCLUDED.tags,
                   status = EXCLUDED.status,
                   ai_featured = EXCLUDED.ai_featured,
                   updated_at = now()`,
                [
                  dealerId,
                  sku,
                  wcProduct.name,
                  'WooCommerce', // brand
                  primaryCategory ? String(primaryCategory) : null,
                  wcProduct.short_description ?? wcProduct.description ?? null,
                  JSON.stringify({ source: 'woocommerce', wc_id: wcProduct.id, weight: wcProduct.weight, dimensions: wcProduct.dimensions }),
                  images,
                  null, // purchase_price
                  sellingPrice,
                  mrp,
                  stockQty,
                  0, // warranty_months
                  null, // product_url
                  tags,
                  wcProduct.status === 'publish' ? 'active' : 'inactive',
                  false, // ai_featured
                ]
              );
              upserted++;
            }

            job.updateProgress(Math.floor((page / totalPages) * 100));
            page++;
          }

          // Mark complete
          await c.query(
            `UPDATE woocommerce_connections SET sync_status = 'completed', last_sync_at = now(), sync_error = NULL, updated_at = now() WHERE id = $1`,
            [connectionId]
          );
          await c.query(
            `UPDATE woocommerce_sync_logs SET completed_at = now(), status = 'success', products_fetched = $1, products_upserted = $2 WHERE id = $3`,
            [fetched, upserted, logId]
          );

          return { fetched, upserted, totalPages };
        });
      } catch (err: any) {
        await client.query(
          `UPDATE woocommerce_connections SET sync_status = 'failed', sync_error = $2, updated_at = now() WHERE id = $1`,
          [connectionId, err.message]
        );
        throw err;
      } finally {
        client.release();
      }
    },
    { connection: REDIS_CONN, concurrency: 2 }
  );

  worker.on('completed', (job) => {
    console.log(`[woocommerce-sync] job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[woocommerce-sync] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export default { enqueueSync, startWoocommerceSyncWorker };
