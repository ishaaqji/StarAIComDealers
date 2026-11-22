import { z } from 'zod';

export const woocommerceConnectionSchema = z.object({
  store_url: z.string().url('Invalid store URL'),
  consumer_key: z.string().min(1, 'Consumer key is required'),
  consumer_secret: z.string().min(1, 'Consumer secret is required'),
  api_version: z.string().default('wc/v3'),
});

export type WooCommerceConnectionInput = z.infer<typeof woocommerceConnectionSchema>;

export const woocommerceConnectionResponseSchema = z.object({
  id: z.string(),
  dealer_id: z.string(),
  store_url: z.string(),
  consumer_key: z.string(), // masked in responses
  consumer_secret: z.string(), // never returned
  api_version: z.string(),
  is_active: z.boolean(),
  last_sync_at: z.string().nullable(),
  sync_status: z.string(),
  sync_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WooCommerceConnectionResponse = z.infer<typeof woocommerceConnectionResponseSchema>;

export const woocommerceSyncLogSchema = z.object({
  id: z.string(),
  dealer_id: z.string(),
  connection_id: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  status: z.string(),
  products_fetched: z.number(),
  products_upserted: z.number(),
  products_skipped: z.number(),
  error_message: z.string().nullable(),
  created_at: z.string(),
});

export type WooCommerceSyncLog = z.infer<typeof woocommerceSyncLogSchema>;

export const woocommerceWebhookSchema = z.object({
  topic: z.string(),
  resource: z.string().optional(),
  resource_id: z.string().optional(),
  store_url: z.string().optional(),
  timestamp: z.string().optional(),
  payload: z.record(z.any()).optional(),
});

export type WooCommerceWebhookInput = z.infer<typeof woocommerceWebhookSchema>;

export const woocommerceProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  status: z.string(),
  sku: z.string().nullable(),
  regular_price: z.string().nullable(),
  sale_price: z.string().nullable(),
  price: z.string(),
  stock_quantity: z.number().nullable(),
  stock_status: z.string(),
  categories: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
  tags: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
  images: z.array(z.object({ id: z.number(), src: z.string(), alt: z.string().nullable() })).default([]),
  description: z.string().optional(),
  short_description: z.string().optional(),
  weight: z.string().nullable(),
  dimensions: z.object({ length: z.string(), width: z.string(), height: z.string() }).optional(),
  date_modified: z.string().optional(),
});

export type WooCommerceProduct = z.infer<typeof woocommerceProductSchema>;
