-- Migration 001: Initial schema (Step 0 — Foundation)
-- Core multi-tenant tables: dealers, dealer_users, dealer_branding, dealer_settings

-- Tenants
CREATE TABLE dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gstin TEXT,
  address JSONB DEFAULT '{}'::jsonb,       -- {line1, city, state, pin}
  contact JSONB DEFAULT '{}'::jsonb,       -- {phone, email, whatsapp}
  website_url TEXT,
  ecommerce_type TEXT,                      -- woocommerce|shopify|custom|none
  specializations TEXT[] DEFAULT '{}',      -- ['gaming_pc','gpu','repair']
  ai_enabled BOOLEAN DEFAULT false,
  local_ai_enabled BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',             -- active|suspended|trial
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staff accounts (belong to a dealer)
CREATE TABLE dealer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dealer_staff', -- dealer_admin|dealer_staff|service_tech
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_dealer_users_dealer_email ON dealer_users(dealer_id, email);

-- Dealer branding (logo, colors, tagline)
CREATE TABLE dealer_branding (
  dealer_id UUID PRIMARY KEY REFERENCES dealers(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  tagline TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-dealer AI config + feature flags
CREATE TABLE dealer_settings (
  dealer_id UUID PRIMARY KEY REFERENCES dealers(id) ON DELETE CASCADE,
  ai_config JSONB DEFAULT '{}'::jsonb,      -- provider, model, temperature
  feature_flags JSONB DEFAULT '{}'::jsonb,  -- {catalog: true, chat: true, local_ai: false}
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row-Level Security: enable on all dealer-scoped tables
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Platform admin (BYPASSRLS) sees everything; dealer-scoped users see only their dealer.
CREATE POLICY dealers_own_tenant ON dealers
  FOR ALL TO PUBLIC
  USING (id = current_setting('app.dealer_id', true)::uuid);

CREATE POLICY dealer_users_own_tenant ON dealer_users
  FOR ALL TO PUBLIC
  USING (dealer_id = current_setting('app.dealer_id', true)::uuid);

CREATE POLICY dealer_branding_own_tenant ON dealer_branding
  FOR ALL TO PUBLIC
  USING (dealer_id = current_setting('app.dealer_id', true)::uuid);

CREATE POLICY dealer_settings_own_tenant ON dealer_settings
  FOR ALL TO PUBLIC
  USING (dealer_id = current_setting('app.dealer_id', true)::uuid);

-- Seed first dealer: Shweta Computers (tenant #1)
INSERT INTO dealers (slug, name, gstin, address, contact, ecommerce_type, specializations, ai_enabled, local_ai_enabled, status)
VALUES (
  'shweta-computers',
  'Shweta Computers',
  '27ABCDE1234F1Z5',
  '{"line1": "Main Road", "city": "Pune", "state": "Maharashtra", "pin": "411001"}',
  '{"phone": "+91-90000-00000", "email": "info@shwetacomputers.in", "whatsapp": "+91-90000-00000"}',
  'woocommerce',
  ARRAY['gaming_pc','gpu','repair','workstation'],
  true,
  false,
  'active'
)
ON CONFLICT (slug) DO NOTHING;

-- Seed dealer admin user for Shweta Computers (password: Admin@123 — change on first login)
INSERT INTO dealer_users (dealer_id, email, password_hash, role)
SELECT id, 'admin@shwetacomputers.in',
       '$2b$12$LQv3c1yqBWVhxCd0L3kOCOu230LMj9/PZl0KxX3lX7mYh5QyFqS2K', -- bcrypt of Admin@123
       'dealer_admin'
FROM dealers WHERE slug = 'shweta-computers'
ON CONFLICT (dealer_id, email) DO NOTHING;

-- Seed branding + settings
INSERT INTO dealer_branding (dealer_id, logo_url, primary_color, tagline)
SELECT id, NULL, '#3B82F6', 'Your AI-Powered Electronics Partner'
FROM dealers WHERE slug = 'shweta-computers'
ON CONFLICT (dealer_id) DO NOTHING;

INSERT INTO dealer_settings (dealer_id, ai_config, feature_flags)
SELECT id,
       '{"provider": "ollama", "model": "llama3.2:3b-instruct-q4_0", "temperature": 0.3}',
       '{"catalog": true, "chat": true, "recommendations": true, "local_ai": false}'
FROM dealers WHERE slug = 'shweta-computers'
ON CONFLICT (dealer_id) DO NOTHING;
