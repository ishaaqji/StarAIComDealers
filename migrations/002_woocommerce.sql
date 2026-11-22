-- Migration 002: WooCommerce connections (Step 3 — WooCommerce Connector)
-- Stores per-dealer WooCommerce store credentials for product sync.

CREATE TABLE IF NOT EXISTS woocommerce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  store_url TEXT NOT NULL,
  consumer_key TEXT NOT NULL,
  consumer_secret TEXT NOT NULL,
  api_version TEXT NOT NULL DEFAULT 'wc/v3',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle',            -- idle|syncing|completed|failed
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_woocommerce_connections_dealer_id
  ON woocommerce_connections(dealer_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_woocommerce_connections_store_url
  ON woocommerce_connections(store_url);

-- Track sync job history for observability
CREATE TABLE IF NOT EXISTS woocommerce_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES woocommerce_connections(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,                       -- success|partial|failed
  products_fetched INT DEFAULT 0,
  products_upserted INT DEFAULT 0,
  products_skipped INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_logs_dealer_id
  ON woocommerce_sync_logs(dealer_id);
CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_logs_connection_id
  ON woocommerce_sync_logs(connection_id);
