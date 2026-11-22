import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getBranding,
  updateBranding,
  getSettings,
  updateSettings,
  listStaff,
  inviteStaff,
  updateStaff,
  deleteStaff,
} from './controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';

const router = Router();

// All dealer routes require a valid session and a dealer-scoped token.
router.use(authenticate);

router.get('/me', getProfile);
router.put('/me', updateProfile);
router.get('/me/branding', getBranding);
router.put('/me/branding', updateBranding);
router.get('/me/settings', getSettings);
router.put('/me/settings', updateSettings);
router.get('/me/users', requireRole('dealer_admin', 'platform_admin'), listStaff);
router.post('/me/users/invite', requireRole('dealer_admin', 'platform_admin'), inviteStaff);
router.put('/me/users/:staff_id', requireRole('dealer_admin', 'platform_admin'), updateStaff);
router.delete('/me/users/:staff_id', requireRole('dealer_admin', 'platform_admin'), deleteStaff);

export default router;
