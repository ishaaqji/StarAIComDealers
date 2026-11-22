-- Migration 003: Knowledge base + RAG (Step 4)
-- Stores documents, text chunks, and vector embeddings for semantic search.

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT NOT NULL,                        -- manual|woocommerce|csv|url
  source_url TEXT,
  content_type TEXT DEFAULT 'text',            -- text|markdown|html|pdf
  metadata JSONB DEFAULT '{}'::jsonb,          -- arbitrary metadata
  is_active BOOLEAN DEFAULT true,
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_dealer_id ON knowledge_base(dealer_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_is_active ON knowledge_base(is_active);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector,                       -- matches Ollama nomic-embed-text / all-MiniLM-L6-v2
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_dealer_id ON knowledge_chunks(dealer_id);

-- Vector similarity search index (HNSW for cosine distance)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search index for hybrid search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_fts
  ON knowledge_chunks USING gin(to_tsvector('english', content));
