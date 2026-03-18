require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./database');
const AuctionExtensionEngine = require('../services/auctionExtensionEngine');
const ActivityLogService = require('../services/activityLogService');

const nowPlusMinutes = (m) => new Date(Date.now() + m * 60 * 1000);
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

async function upsertUser(client, { id, name, email, passwordHash, role, company_name }) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return existing.rows[0].id;

  const res = await client.query(
    `INSERT INTO users (id, name, email, password_hash, role, company_name)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [id, name, email, passwordHash, role, company_name]
  );
  return res.rows[0].id;
}

async function createRfq(client, {
  rfqId,
  reference_id,
  name,
  description,
  buyer_id,
  status,
  bid_start_time,
  bid_close_time,
  forced_close_time,
  pickup_service_date,
  origin,
  destination,
  cargo_description,
  trigger_window_minutes,
  extension_duration_minutes,
  extension_trigger_type,
  max_extensions,
}) {
  const rfqRes = await client.query(
    `INSERT INTO rfqs (
      id, reference_id, name, description, buyer_id,
      bid_start_time, bid_close_time, forced_close_time,
      pickup_service_date, status, origin, destination, cargo_description
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,
      $9,$10,$11,$12,$13
    )
    RETURNING id`,
    [
      rfqId, reference_id, name, description, buyer_id,
      bid_start_time, bid_close_time, forced_close_time,
      pickup_service_date, status, origin, destination, cargo_description
    ]
  );

  await client.query(
    `INSERT INTO auction_configs (
      rfq_id, trigger_window_minutes, extension_duration_minutes,
      extension_trigger_type, max_extensions
    ) VALUES ($1,$2,$3,$4,$5)`,
    [
      rfqId,
      trigger_window_minutes,
      extension_duration_minutes,
      extension_trigger_type,
      max_extensions
    ]
  );

  await ActivityLogService.logRfqCreated({
    rfqId,
    actorId: buyer_id,
    actorName: 'Seed',
    rfqName: name,
    referenceId: reference_id
  }, client);

  return rfqRes.rows[0].id;
}

async function inviteSuppliers(client, rfqId, supplierIds) {
  for (const supplierId of supplierIds) {
    await client.query(
      `INSERT INTO rfq_suppliers (rfq_id, supplier_id, status)
       VALUES ($1, $2, 'invited')
       ON CONFLICT DO NOTHING`,
      [rfqId, supplierId]
    );
    await ActivityLogService.log({
      rfqId,
      eventType: 'supplier_invited',
      actorId: null,
      actorName: 'System',
      description: `Supplier invited to auction`,
      metadata: { supplierId }
    }, client);
  }
}

async function insertBid(client, rfqId, supplierId, bid) {
  const res = await client.query(
    `INSERT INTO bids (
      rfq_id, supplier_id, carrier_name,
      freight_charges, origin_charges, destination_charges,
      transit_time_days, quote_validity_date, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id`,
    [
      rfqId,
      supplierId,
      bid.carrier_name,
      bid.freight_charges,
      bid.origin_charges ?? 0,
      bid.destination_charges ?? 0,
      bid.transit_time_days,
      bid.quote_validity_date,
      bid.notes ?? null
    ]
  );
  return res.rows[0].id;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash('password123', 10);

    //Users 
    const buyerId = await upsertUser(client, {
      id: uuidv4(),
      name: 'Demo Buyer',
      email: 'buyer@demo.com',
      passwordHash: hash,
      role: 'buyer',
      company_name: 'Acme Procurement'
    });

    const supplier1Id = await upsertUser(client, {
      id: uuidv4(),
      name: 'Demo Supplier 1',
      email: 'supplier1@demo.com',
      passwordHash: hash,
      role: 'supplier',
      company_name: 'FastFreight Ltd'
    });

    const supplier2Id = await upsertUser(client, {
      id: uuidv4(),
      name: 'Demo Supplier 2',
      email: 'supplier2@demo.com',
      passwordHash: hash,
      role: 'supplier',
      company_name: 'QuickShip Co'
    });

    const supplier3Id = await upsertUser(client, {
      id: uuidv4(),
      name: 'Demo Supplier 3',
      email: 'supplier3@demo.com',
      passwordHash: hash,
      role: 'supplier',
      company_name: 'GlobalCargo Inc'
    });

    // ── RFQs (varied statuses) ────────────────────────────────────────────────
    const rfqActiveId = uuidv4();
    const rfqDraftId = uuidv4();
    const rfqClosedId = uuidv4();
    const rfqForceClosedId = uuidv4();

    // Active auction: closes soon so you can test extensions in minutes
    await createRfq(client, {
      rfqId: rfqActiveId,
      reference_id: `RFQ-DEMO-ACTIVE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      name: 'Domestic Freight — Mumbai → Delhi (Active)',
      description: 'Active demo auction for live bidding + extension testing.',
      buyer_id: buyerId,
      status: 'active',
      bid_start_time: nowPlusMinutes(-20),
      bid_close_time: nowPlusMinutes(8),
      forced_close_time: nowPlusMinutes(25),
      pickup_service_date: todayIsoDate(),
      origin: 'Mumbai Port',
      destination: 'Delhi Warehouse',
      cargo_description: '20 MT Machinery parts',
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      extension_trigger_type: 'bid_received',
      max_extensions: 3,
    });
    await inviteSuppliers(client, rfqActiveId, [supplier1Id, supplier2Id, supplier3Id]);

    // Draft auction: for activate flow testing
    await createRfq(client, {
      rfqId: rfqDraftId,
      reference_id: `RFQ-DEMO-DRAFT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      name: 'Ocean Freight — Chennai → Rotterdam (Draft)',
      description: 'Draft RFQ to test activation.',
      buyer_id: buyerId,
      status: 'draft',
      bid_start_time: nowPlusMinutes(60),
      bid_close_time: nowPlusMinutes(120),
      forced_close_time: nowPlusMinutes(180),
      pickup_service_date: todayIsoDate(),
      origin: 'Chennai Port',
      destination: 'Rotterdam Port',
      cargo_description: '2x 40ft containers — consumer goods',
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      extension_trigger_type: 'any_rank_change',
      max_extensions: 10,
    });
    await inviteSuppliers(client, rfqDraftId, [supplier1Id, supplier2Id]);

    // Closed auction: historical viewing
    await createRfq(client, {
      rfqId: rfqClosedId,
      reference_id: `RFQ-DEMO-CLOSED-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      name: 'Air Cargo — Bengaluru → Singapore (Closed)',
      description: 'Closed auction with bids and ranking.',
      buyer_id: buyerId,
      status: 'closed',
      bid_start_time: nowPlusMinutes(-240),
      bid_close_time: nowPlusMinutes(-180),
      forced_close_time: nowPlusMinutes(-170),
      pickup_service_date: todayIsoDate(),
      origin: 'Bengaluru',
      destination: 'Singapore',
      cargo_description: '1.2 MT electronics (fragile)',
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      extension_trigger_type: 'l1_rank_change',
      max_extensions: 2,
    });
    await inviteSuppliers(client, rfqClosedId, [supplier1Id, supplier2Id, supplier3Id]);

    // Force closed auction: shows forced close status
    await createRfq(client, {
      rfqId: rfqForceClosedId,
      reference_id: `RFQ-DEMO-FORCE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      name: 'Rail Freight — Pune → Ahmedabad (Force Closed)',
      description: 'Force-closed auction for status testing.',
      buyer_id: buyerId,
      status: 'force_closed',
      bid_start_time: nowPlusMinutes(-120),
      bid_close_time: nowPlusMinutes(-60),
      forced_close_time: nowPlusMinutes(-30),
      pickup_service_date: todayIsoDate(),
      origin: 'Pune',
      destination: 'Ahmedabad',
      cargo_description: 'Steel components — 12 MT',
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      extension_trigger_type: 'bid_received',
      max_extensions: 1,
    });
    await inviteSuppliers(client, rfqForceClosedId, [supplier1Id, supplier2Id]);

    // Bids 
    const activeBid1 = await insertBid(client, rfqActiveId, supplier1Id, {
      carrier_name: 'DHL',
      freight_charges: 82000,
      origin_charges: 3500,
      destination_charges: 2200,
      transit_time_days: 4,
      quote_validity_date: todayIsoDate(),
      notes: 'Includes insurance. Delivery within 4 days.'
    });
    const activeBid2 = await insertBid(client, rfqActiveId, supplier2Id, {
      carrier_name: 'FedEx',
      freight_charges: 79000,
      origin_charges: 5000,
      destination_charges: 1800,
      transit_time_days: 5,
      quote_validity_date: todayIsoDate(),
      notes: 'Standard lanes. Pickup next business day.'
    });
    const activeBid3 = await insertBid(client, rfqActiveId, supplier3Id, {
      carrier_name: 'Blue Dart',
      freight_charges: 84500,
      origin_charges: 2000,
      destination_charges: 2500,
      transit_time_days: 3,
      quote_validity_date: todayIsoDate(),
      notes: 'Fastest transit, premium handling.'
    });

    // Closed auction bids
    await insertBid(client, rfqClosedId, supplier1Id, {
      carrier_name: 'Singapore Airlines Cargo',
      freight_charges: 145000,
      origin_charges: 7000,
      destination_charges: 6000,
      transit_time_days: 2,
      quote_validity_date: todayIsoDate(),
    });
    await insertBid(client, rfqClosedId, supplier2Id, {
      carrier_name: 'Emirates SkyCargo',
      freight_charges: 138000,
      origin_charges: 9000,
      destination_charges: 7000,
      transit_time_days: 3,
      quote_validity_date: todayIsoDate(),
    });

    await AuctionExtensionEngine.recalculateRankings(rfqActiveId, client);
    await AuctionExtensionEngine.recalculateRankings(rfqClosedId, client);

    // Activity
    await ActivityLogService.logBidSubmitted({
      rfqId: rfqActiveId,
      actorId: supplier1Id,
      actorName: 'Demo Supplier 1',
      bidId: activeBid1,
      totalPrice: 82000 + 3500 + 2200,
      rank: null,
      previousRank: null,
    }, client);
    await ActivityLogService.logBidSubmitted({
      rfqId: rfqActiveId,
      actorId: supplier2Id,
      actorName: 'Demo Supplier 2',
      bidId: activeBid2,
      totalPrice: 79000 + 5000 + 1800,
      rank: null,
      previousRank: null,
    }, client);
    await ActivityLogService.logBidSubmitted({
      rfqId: rfqActiveId,
      actorId: supplier3Id,
      actorName: 'Demo Supplier 3',
      bidId: activeBid3,
      totalPrice: 84500 + 2000 + 2500,
      rank: null,
      previousRank: null,
    }, client);

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log('');
    console.log('Demo accounts (password: password123):');
    console.log('- Buyer:     buyer@demo.com');
    console.log('- Supplier1: supplier1@demo.com');
    console.log('- Supplier2: supplier2@demo.com');
    console.log('- Supplier3: supplier3@demo.com');
    console.log('');
    console.log('Created RFQs:');
    console.log(`- Active:       ${rfqActiveId}`);
    console.log(`- Draft:        ${rfqDraftId}`);
    console.log(`- Closed:       ${rfqClosedId}`);
    console.log(`- Force closed: ${rfqForceClosedId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

