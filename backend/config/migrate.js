const pool = require('./database');
require('dotenv').config();

const createTables = async () => {
  const client = await pool.connect();

  try {
    console.log('Running database migrations...');

    await client.query('BEGIN');

    // USERS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'supplier' CHECK (role IN ('buyer', 'supplier', 'admin')),
        company_name VARCHAR(255),
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    //RFQ TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bid_start_time TIMESTAMPTZ NOT NULL,
        bid_close_time TIMESTAMPTZ NOT NULL,
        forced_close_time TIMESTAMPTZ NOT NULL,
        pickup_service_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'force_closed', 'cancelled')),
        origin VARCHAR(255),
        destination VARCHAR(255),
        cargo_description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT forced_after_close CHECK (forced_close_time > bid_close_time)
      );
    `);

    //  AUCTION CONFIG TABLE 
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id UUID UNIQUE NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        trigger_window_minutes INTEGER NOT NULL DEFAULT 10 CHECK (trigger_window_minutes > 0),
        extension_duration_minutes INTEGER NOT NULL DEFAULT 5 CHECK (extension_duration_minutes > 0),
        extension_trigger_type VARCHAR(50) NOT NULL DEFAULT 'bid_received'
          CHECK (extension_trigger_type IN ('bid_received', 'any_rank_change', 'l1_rank_change')),
        max_extensions INTEGER DEFAULT 10,
        extension_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // RFQ SUPPLIERS TABLE 
    await client.query(`
      CREATE TABLE IF NOT EXISTS rfq_suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined', 'submitted')),
        UNIQUE(rfq_id, supplier_id)
      );
    `);

    // BIDS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        carrier_name VARCHAR(255) NOT NULL,
        freight_charges NUMERIC(15,2) NOT NULL CHECK (freight_charges >= 0),
        origin_charges NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (origin_charges >= 0),
        destination_charges NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (destination_charges >= 0),
        total_price NUMERIC(15,2) GENERATED ALWAYS AS (freight_charges + origin_charges + destination_charges) STORED,
        transit_time_days INTEGER NOT NULL CHECK (transit_time_days > 0),
        quote_validity_date DATE NOT NULL,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        rank INTEGER,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ACTIVITY LOGS TABLE 
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
          'rfq_created', 'rfq_activated', 'rfq_closed', 'rfq_force_closed',
          'bid_submitted', 'bid_updated', 'auction_extended', 'supplier_invited',
          'rank_changed', 'extension_limit_reached'
        )),
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_name VARCHAR(255),
        description TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    //  INDEXES
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rfqs_buyer ON rfqs(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
      CREATE INDEX IF NOT EXISTS idx_rfqs_bid_close ON rfqs(bid_close_time);
      CREATE INDEX IF NOT EXISTS idx_bids_rfq ON bids(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_bids_supplier ON bids(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_bids_total ON bids(rfq_id, total_price) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_activity_rfq ON activity_logs(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_rfq_suppliers ON rfq_suppliers(rfq_id, supplier_id);
    `);

    await client.query('COMMIT');
    console.log('All tables created successfully!');

    
    await seedDemoData(client);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

const seedDemoData = async (client) => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    
    const existing = await client.query("SELECT id FROM users WHERE email = 'buyer@demo.com'");
    if (existing.rows.length > 0) {
      console.log('Demo data already exists, skipping seed.');
      return;
    }

    console.log('Seeding demo data...');
    const hash = await bcrypt.hash('password123', 10);

    const buyerId = uuidv4();
    const sup1Id = uuidv4();
    const sup2Id = uuidv4();
    const sup3Id = uuidv4();

    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, company_name) VALUES
      ('${buyerId}', 'John Buyer', 'buyer@demo.com', '${hash}', 'buyer', 'Acme Corp'),
      ('${sup1Id}', 'Alice Supplier', 'supplier1@demo.com', '${hash}', 'supplier', 'FastFreight Ltd'),
      ('${sup2Id}', 'Bob Supplier', 'supplier2@demo.com', '${hash}', 'supplier', 'QuickShip Co'),
      ('${sup3Id}', 'Carol Supplier', 'supplier3@demo.com', '${hash}', 'supplier', 'GlobalCargo Inc')
    `);

    console.log('Demo users seeded!');
    console.log('Buyer login: buyer@demo.com / password123');
    console.log('Supplier login: supplier1@demo.com / password123');

  } catch (err) {
    console.error('Seed error (non-fatal):', err.message);
  }
};

createTables().catch(console.error);
