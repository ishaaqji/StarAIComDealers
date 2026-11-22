import { z } from 'zod';

export const knowledgeDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  source: z.enum(['manual', 'woocommerce', 'csv', 'url']).default('manual'),
  source_url: z.string().url().optional().nullable(),
  content_type: z.enum(['text', 'markdown', 'html', 'pdf']).default('text'),
  content: z.string().min(1),
  metadata: z.record(z.any()).default({}),
});

export type KnowledgeDocumentInput = z.infer<typeof knowledgeDocumentSchema>;

export const knowledgeDocumentResponseSchema = z.object({
  id: z.string(),
  dealer_id: z.string(),
  title: z.string(),
  source: z.string(),
  source_url: z.string().nullable(),
  content_type: z.string(),
  metadata: z.any(),
  is_active: z.boolean(),
  chunk_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type KnowledgeDocumentResponse = z.infer<typeof knowledgeDocumentResponseSchema>;

export const knowledgeSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  threshold: z.coerce.number().min(0).max(1).default(0.5),
});

export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchSchema>;

export const knowledgeSearchResultSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  document_title: z.string(),
  chunk_index: z.number(),
  content: z.string(),
  similarity: z.number(),
  metadata: z.any(),
});

export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

export const knowledgeQuerySchema = z.object({
  question: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  threshold: z.coerce.number().min(0).max(1).default(0.5),
});

export type KnowledgeQueryInput = z.infer<typeof knowledgeQuerySchema>;

export const knowledgeQueryResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(knowledgeSearchResultSchema),
});

export type KnowledgeQueryResponse = z.infer<typeof knowledgeQueryResponseSchema>;
