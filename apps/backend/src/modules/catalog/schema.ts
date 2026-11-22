import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  parent_id: z.string().uuid().optional().nullable(),
  icon: z.string().optional().nullable(),
  sort_order: z.coerce.number().int().default(0),
});

export const productSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  brand: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  specs: z.record(z.any()).default({}),
  images: z.array(z.string()).default([]),
  purchase_price: z.coerce.number().nonnegative().optional().nullable(),
  selling_price: z.coerce.number().nonnegative(),
  mrp: z.coerce.number().nonnegative().optional().nullable(),
  stock_qty: z.coerce.number().int().nonnegative().default(0),
  warranty_months: z.coerce.number().int().nonnegative().default(0),
  product_url: z.string().url().optional().nullable(),
  tags: z.array(z.string()).default([]),
  status: z.enum(['active', 'inactive', 'discontinued']).default('active'),
  ai_featured: z.boolean().default(false),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  status: z.string().optional(),
  min_stock: z.coerce.number().int().nonnegative().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
