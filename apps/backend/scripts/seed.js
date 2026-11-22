/**
 * Seed script (plain JS, run with `node` after build).
 * Idempotently ensures tenant #1 (Shweta Computers) + dealer admin exist.
 */
const { pool } = require('../dist/modules/db/connection');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Dealer: Shweta Computers (tenant #1)
    const { rows: dealers } = await client.query(
      `INSERT INTO dealers (slug, name, gstin, address, contact, ecommerce_type, specializations, ai_enabled, local_ai_enabled, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         gstin = EXCLUDED.gstin,
         address = EXCLUDED.address,
         contact = EXCLUDED.contact,
         ecommerce_type = EXCLUDED.ecommerce_type,
         specializations = EXCLUDED.specializations,
         ai_enabled = EXCLUDED.ai_enabled,
         local_ai_enabled = EXCLUDED.local_ai_enabled,
         status = EXCLUDED.status
       RETURNING id`,
      [
        'shweta-computers',
        'Shweta Computers',
        '27ABCDE1234F1Z5',
        JSON.stringify({ line1: 'Main Road', city: 'Pune', state: 'Maharashtra', pin: '411001' }),
        JSON.stringify({ phone: '+91-90000-00000', email: 'info@shwetacomputers.in', whatsapp: '+91-90000-00000' }),
        'woocommerce',
        ['gaming_pc', 'gpu', 'repair', 'workstation'],
        true,
        false,
        'active',
      ]
    );
    const dealerId = dealers[0].id;

    // Dealer admin user (password: Admin@123)
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await client.query(
      `INSERT INTO dealer_users (dealer_id, email, name, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'dealer_admin')
       ON CONFLICT (dealer_id, email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         name = EXCLUDED.name`,
      [dealerId, 'admin@shwetacomputers.in', 'Shweta Admin', '+91-90000-00000', passwordHash]
    );

    // Branding
    await client.query(
      `INSERT INTO dealer_branding (dealer_id, logo_url, primary_color, tagline)
       VALUES ($1, NULL, $2, $3)
       ON CONFLICT (dealer_id) DO UPDATE SET
         primary_color = EXCLUDED.primary_color,
         tagline = EXCLUDED.tagline,
         updated_at = now()`,
      [dealerId, '#3B82F6', 'Your AI-Powered Electronics Partner']
    );

    // Settings (single `settings` JSONB column in this environment)
    const settingsPayload = {
      ai_config: { provider: 'ollama', model: 'llama3.2:3b-instruct-q4_0', temperature: 0.3 },
      feature_flags: { catalog: true, chat: true, recommendations: true, local_ai: false },
    };
    await client.query(
      `INSERT INTO dealer_settings (dealer_id, settings)
       VALUES ($1,$2)
       ON CONFLICT (dealer_id) DO UPDATE SET
         settings = EXCLUDED.settings,
         updated_at = now()`,
      [dealerId, JSON.stringify(settingsPayload)]
    );

    await client.query('COMMIT');
    console.log('[seed] Shweta Computers (dealer_id=' + dealerId + ') ready');
    console.log('[seed] Admin: admin@shwetacomputers.in / Admin@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
