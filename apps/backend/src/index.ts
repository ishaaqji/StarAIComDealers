import express from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
console.log('[env] DATABASE_URL loaded:', !!process.env.DATABASE_URL);
import { pool } from './modules/db/connection';
import { apiRateLimit } from './modules/middleware/rate-limit';
import { errorHandler, validate } from './modules/shared/validate';
import authRoutes from './modules/auth/routes';
import dealerRoutes from './modules/dealers/routes';
import catalogRoutes from './modules/catalog/routes';
import woocommerceRoutes from './modules/woocommerce/routes';
import knowledgeRoutes from './modules/knowledge/routes';
import { startWoocommerceSyncWorker } from './modules/woocommerce/job';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (dev)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
    next();
  });
}

// Global rate limit (per-IP + per-dealer when authenticated)
app.use(apiRateLimit);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'star-ai-api', time: new Date().toISOString() });
});

// Mount API routes
app.use('/v1/auth', authRoutes);
app.use('/v1/dealers', dealerRoutes);
app.use('/v1/catalog', catalogRoutes);
app.use('/v1/woocommerce', woocommerceRoutes);
app.use('/v1/knowledge', knowledgeRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Centralized error handler (must be last)
app.use(errorHandler);

let server: any;
async function start() {
  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] connection failed:', err);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`[api] Star AI Platform V1 listening on :${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  // Start WooCommerce sync worker (optional, disabled if SKIP_WORKER=true)
  if (process.env.SKIP_WORKER !== 'true') {
    const wcWorker = startWoocommerceSyncWorker();
    console.log('[woocommerce] sync worker started');
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[api] SIGTERM received, shutting down...');
  server?.close();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[api] SIGINT received, shutting down...');
  server?.close();
  await pool.end();
  process.exit(0);
});

export { app };
