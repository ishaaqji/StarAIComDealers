import { z } from 'zod';

// -------- Auth --------
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// -------- Dealers --------
export const dealerProfileSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'lowercase alphanumeric hyphens'),
  gstin: z.string().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  ecommerce_type: z.enum(['woocommerce', 'shopify', 'custom', 'none']).optional(),
  specializations: z.array(z.string()).default([]),
  ai_enabled: z.boolean().default(false),
  local_ai_enabled: z.boolean().default(false),
  status: z.enum(['active', 'suspended', 'trial']).default('active'),
});

export const dealerBrandingSchema = z.object({
  logo_url: z.string().url().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  tagline: z.string().max(200).optional().nullable(),
});

export const dealerSettingsSchema = z.object({
  ai_config: z.record(z.any()).default({}),
  feature_flags: z.record(z.any()).default({}),
});

// -------- Pagination --------
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type DealerProfileInput = z.infer<typeof dealerProfileSchema>;
export type DealerBrandingInput = z.infer<typeof dealerBrandingSchema>;
export type DealerSettingsInput = z.infer<typeof dealerSettingsSchema>;
