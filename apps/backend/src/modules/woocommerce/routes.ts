import { Router } from 'express';
import {
  createConnection,
  getConnection,
  deleteConnection,
  triggerSync,
  syncStatus,
  webhook,
} from './controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// WooCommerce connections
router.post('/connections', requireRole('dealer_admin', 'platform_admin'), createConnection);
router.get('/connections', getConnection);
router.delete('/connections', requireRole('dealer_admin', 'platform_admin'), deleteConnection);

// Sync
router.post('/sync', requireRole('dealer_admin', 'platform_admin'), triggerSync);
router.get('/sync/status', syncStatus);

// Webhooks (WooCommerce sends these without bearer auth; secured by secret token in header)
router.post('/webhook', webhook);

export default router;
