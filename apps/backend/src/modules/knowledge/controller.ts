import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import {
  knowledgeDocumentSchema,
  knowledgeSearchSchema,
  knowledgeQuerySchema,
  type KnowledgeDocumentInput,
  type KnowledgeSearchInput,
  type KnowledgeQueryInput,
} from './schema';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const CHAT_MODEL = process.env.CHAT_MODEL || 'qwen3:4b';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_DIM = 768;

/* ---------- Chunking ---------- */

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

/* ---------- Ollama helpers ---------- */

async function ollamaEmbed(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`Ollama embeddings failed: ${resp.status}`);
    const data: any = await resp.json();
    return data.embedding as number[];
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

async function ollamaChat(messages: { role: string; content: string }[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`Ollama chat failed: ${resp.status}`);
    const data: any = await resp.json();
    return data.message?.content ?? 'No answer generated.';
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

/* ---------- Document CRUD ---------- */

export async function createDocument(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = knowledgeDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO knowledge_base (dealer_id, title, source, source_url, content_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, dealer_id, title, source, source_url, content_type, metadata, is_active, chunk_count, created_at, updated_at`,
      [
        dealerId,
        parsed.data.title,
        parsed.data.source,
        parsed.data.source_url ?? null,
        parsed.data.content_type,
        JSON.stringify(parsed.data.metadata),
      ]
    );
    const docId = rows[0].id;

    // Chunk and embed the content
    const chunks = chunkText(parsed.data.content);
    let embedded = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await ollamaEmbed(chunks[i]);
        await client.query(
          `INSERT INTO knowledge_chunks (document_id, dealer_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [docId, dealerId, i, chunks[i], `[${embedding.join(',')}]`]
        );
        embedded++;
      } catch (err) {
        console.error(`[knowledge] embedding failed for chunk ${i}:`, err);
      }
    }

    await client.query(
      `UPDATE knowledge_base SET chunk_count = $1, updated_at = now() WHERE id = $2`,
      [embedded, docId]
    );
    await client.query('COMMIT');

    res.status(201).json({
      ...rows[0],
      chunk_count: embedded,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error', details: err.message });
  } finally {
    client.release();
  }
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, dealer_id, title, source, source_url, content_type, metadata, is_active,
                chunk_count, created_at, updated_at
         FROM knowledge_base WHERE dealer_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [dealerId]
      );
      res.json(rows);
    });
  } finally {
    client.release();
  }
}

export async function getDocument(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const docId = req.params.id;
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, dealer_id, title, source, source_url, content_type, metadata, is_active,
                chunk_count, created_at, updated_at
         FROM knowledge_base WHERE dealer_id = $1 AND id = $2`,
        [dealerId, docId]
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'document_not_found' });
        return;
      }
      res.json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const docId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `DELETE FROM knowledge_chunks WHERE document_id = $1 AND dealer_id = $2`,
      [docId, dealerId]
    );
    const { rowCount: docRowCount } = await client.query(
      `DELETE FROM knowledge_base WHERE id = $1 AND dealer_id = $2`,
      [docId, dealerId]
    );
    await client.query('COMMIT');
    if (docRowCount === 0) {
      res.status(404).json({ error: 'document_not_found' });
      return;
    }
    res.json({ deleted_chunks: rowCount, deleted_documents: docRowCount });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error', details: err.message });
  } finally {
    client.release();
  }
}

/* ---------- Vector search ---------- */

export async function searchKnowledge(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = knowledgeSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { query, limit, threshold } = parsed.data;

  try {
    const queryEmbedding = await ollamaEmbed(query);
    const client = await pool.connect();
    try {
      await withDealerContext(client, dealerId, async (c) => {
        const { rows } = await c.query(
          `SELECT kc.id, kc.document_id, kb.title AS document_title, kc.chunk_index, kc.content,
                  kc.metadata,
                  1 - (kc.embedding <=> $1::vector) AS similarity
           FROM knowledge_chunks kc
           JOIN knowledge_base kb ON kb.id = kc.document_id
           WHERE kc.dealer_id = $2 AND kb.is_active = true AND kc.embedding IS NOT NULL
             AND 1 - (kc.embedding <=> $1::vector) >= $3
           ORDER BY kc.embedding <=> $1::vector
           LIMIT $4`,
          [`[${queryEmbedding.join(',')}]`, dealerId, threshold, limit]
        );
        res.json(rows);
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: 'search_failed', details: err.message });
  }
}

/* ---------- RAG query ---------- */

export async function queryKnowledge(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = knowledgeQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { question, limit, threshold } = parsed.data;

  try {
    // Step 1: Vector search for relevant chunks
    const queryEmbedding = await ollamaEmbed(question);
    const client = await pool.connect();
    try {
      await withDealerContext(client, dealerId, async (c) => {
        const { rows: chunks } = await c.query(
          `SELECT kc.id, kc.document_id, kb.title AS document_title, kc.chunk_index, kc.content,
                  kc.metadata,
                  1 - (kc.embedding <=> $1::vector) AS similarity
           FROM knowledge_chunks kc
           JOIN knowledge_base kb ON kb.id = kc.document_id
           WHERE kc.dealer_id = $2 AND kb.is_active = true AND kc.embedding IS NOT NULL
             AND 1 - (kc.embedding <=> $1::vector) >= $3
           ORDER BY kc.embedding <=> $1::vector
           LIMIT $4`,
          [`[${queryEmbedding.join(',')}]`, dealerId, threshold, limit]
        );

        if (chunks.length === 0) {
          res.json({
            answer: "I couldn't find any relevant information in your knowledge base to answer that question.",
            sources: [],
          });
          return;
        }

        // Step 2: Build context from chunks
        const context = chunks
          .map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.content}`)
          .join('\n\n---\n\n');

        const systemPrompt = `You are a helpful AI assistant for a dealer's knowledge base. Answer the user's question using ONLY the provided context sources. If the answer is not in the sources, say you don't know. Cite sources by their number (e.g., [Source 1]). Be concise and accurate.

Context:
${context}`;

        // Step 3: Generate answer with Ollama
        const answer = await ollamaChat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ]);

        res.json({
          answer,
          sources: chunks.map((c) => ({
            id: c.id,
            document_id: c.document_id,
            document_title: c.document_title,
            chunk_index: c.chunk_index,
            content: c.content,
            similarity: Number(c.similarity),
            metadata: c.metadata,
          })),
        });
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: 'query_failed', details: err.message });
  }
}

export default {
  createDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  searchKnowledge,
  queryKnowledge,
};
