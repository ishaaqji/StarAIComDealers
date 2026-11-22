import { Router } from 'express';
import { login, refresh, me, register } from './controller';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rate-limit';

const router = Router();

router.post('/login', authRateLimit, login);
router.post('/refresh', authRateLimit, refresh);
router.post('/register', authRateLimit, register);
router.get('/me', authenticate, me);

export default router;
