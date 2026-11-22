import { Router } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
} from './controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Categories
router.get('/categories', listCategories);
router.post('/categories', requireRole('dealer_admin', 'platform_admin'), createCategory);
router.put('/categories/:id', requireRole('dealer_admin', 'platform_admin'), updateCategory);
router.delete('/categories/:id', requireRole('dealer_admin', 'platform_admin'), deleteCategory);

// Products
router.get('/products', listProducts);
router.post('/products', requireRole('dealer_admin', 'platform_admin'), createProduct);
router.get('/products/:id', getProduct);
router.put('/products/:id', requireRole('dealer_admin', 'platform_admin'), updateProduct);
router.delete('/products/:id', requireRole('dealer_admin', 'platform_admin'), deleteProduct);

export default router;
