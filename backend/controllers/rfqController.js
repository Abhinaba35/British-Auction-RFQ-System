const pool = require('../config/database');
const ActivityLogService = require('../services/activityLogService');


const generateReferenceId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RFQ-${date}-${suffix}`;
};


const createRFQ = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name, description, bid_start_time, bid_close_time, forced_close_time,
      pickup_service_date, origin, destination, cargo_description,
      trigger_window_minutes = 10, extension_duration_minutes = 5,
      extension_trigger_type = 'bid_received', max_extensions = 10,
      supplier_ids = []
    } = req.body;

    // Validation 
    if (!name || !bid_start_time || !bid_close_time || !forced_close_time || !pickup_service_date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const closeTime = new Date(bid_close_time);
    const forcedTime = new Date(forced_close_time);
    const startTime = new Date(bid_start_time);

    if (forcedTime <= closeTime) {
      return res.status(400).json({
        success: false,
        message: 'Forced close time must be later than bid close time'
      });
    }

    if (closeTime <= startTime) {
      return res.status(400).json({
        success: false,
        message: 'Bid close time must be after bid start time'
      });
    }

    await client.query('BEGIN');

    const referenceId = generateReferenceId();

    // Create RFQ
    const rfqResult = await client.query(
      `INSERT INTO rfqs (reference_id, name, description, buyer_id, bid_start_time, bid_close_time,
        forced_close_time, pickup_service_date, origin, destination, cargo_description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       RETURNING *`,
      [referenceId, name.trim(), description, req.user.id, bid_start_time, bid_close_time,
       forced_close_time, pickup_service_date, origin, destination, cargo_description]
    );

    const rfq = rfqResult.rows[0];

    // Create auction config
    await client.query(
      `INSERT INTO auction_configs (rfq_id, trigger_window_minutes, extension_duration_minutes,
        extension_trigger_type, max_extensions)
       VALUES ($1,$2,$3,$4,$5)`,
      [rfq.id, trigger_window_minutes, extension_duration_minutes,
       extension_trigger_type, max_extensions]
    );

    // Invite suppliers
    if (supplier_ids.length > 0) {
      for (const supplierId of supplier_ids) {
        await client.query(
          `INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [rfq.id, supplierId]
        );
      }
    }

    // Log creation
    await ActivityLogService.logRfqCreated({
      rfqId: rfq.id,
      actorId: req.user.id,
      actorName: req.user.name,
      rfqName: name,
      referenceId
    }, client);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'RFQ created successfully',
      data: { rfq }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create RFQ error:', err);
    res.status(500).json({ success: false, message: 'Failed to create RFQ' });
  } finally {
    client.release();
  }
};


const getAuctions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (req.user.role === 'buyer') {
      whereClause = 'WHERE r.buyer_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'supplier') {
      whereClause = 'WHERE rs.supplier_id = $1';
      params.push(req.user.id);
    }

    if (status) {
      whereClause += (whereClause ? ' AND' : 'WHERE') + ` r.status = $${params.length + 1}`;
      params.push(status);
    }

    const query = `
      SELECT DISTINCT
        r.id, r.reference_id, r.name, r.status,
        r.bid_start_time, r.bid_close_time, r.forced_close_time,
        r.pickup_service_date, r.origin, r.destination,
        u.name AS buyer_name, u.company_name AS buyer_company,
        ac.trigger_window_minutes, ac.extension_duration_minutes,
        ac.extension_trigger_type, ac.extension_count,
        (SELECT MIN(b.total_price) FROM bids b WHERE b.rfq_id = r.id AND b.is_active = true) AS lowest_bid,
        (SELECT COUNT(DISTINCT b.supplier_id) FROM bids b WHERE b.rfq_id = r.id) AS bid_count,
        r.created_at
      FROM rfqs r
      JOIN users u ON u.id = r.buyer_id
      JOIN auction_configs ac ON ac.rfq_id = r.id
      LEFT JOIN rfq_suppliers rs ON rs.rfq_id = r.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    const now = new Date();
    const updatedAuctions = result.rows.map(rfq => {
      let computedStatus = rfq.status;
      if (rfq.status === 'draft' && now >= new Date(rfq.bid_start_time)) {
        computedStatus = 'active';
      }
      if (rfq.status === 'active' && now >= new Date(rfq.forced_close_time)) {
        computedStatus = 'force_closed';
      } else if (rfq.status === 'active' && now >= new Date(rfq.bid_close_time)) {
        computedStatus = 'closed';
      }
      return { ...rfq, computed_status: computedStatus };
    });

    res.json({ success: true, data: { auctions: updatedAuctions } });
  } catch (err) {
    console.error('Get auctions error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch auctions' });
  }
};

const getAuctionDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const rfqResult = await pool.query(
      `SELECT r.*, u.name AS buyer_name, u.company_name AS buyer_company,
              ac.trigger_window_minutes, ac.extension_duration_minutes,
              ac.extension_trigger_type, ac.max_extensions, ac.extension_count
       FROM rfqs r
       JOIN users u ON u.id = r.buyer_id
       JOIN auction_configs ac ON ac.rfq_id = r.id
       WHERE r.id = $1`,
      [id]
    );

    if (!rfqResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    const rfq = rfqResult.rows[0];

    const bidsResult = await pool.query(
      `SELECT b.id, b.carrier_name, b.freight_charges, b.origin_charges,
              b.destination_charges, b.total_price, b.transit_time_days,
              b.quote_validity_date, b.rank, b.notes, b.submitted_at,
              u.name AS supplier_name, u.company_name AS supplier_company,
              u.id AS supplier_id
       FROM bids b
       JOIN users u ON u.id = b.supplier_id
       WHERE b.rfq_id = $1 AND b.is_active = true
       ORDER BY b.total_price ASC`,
      [id]
    );

    const suppliersResult = await pool.query(
      `SELECT rs.status AS invite_status, u.id, u.name, u.company_name, u.email
       FROM rfq_suppliers rs
       JOIN users u ON u.id = rs.supplier_id
       WHERE rs.rfq_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        rfq,
        bids: bidsResult.rows,
        suppliers: suppliersResult.rows
      }
    });
  } catch (err) {
    console.error('Get auction details error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch auction details' });
  }
};

const activateRFQ = async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await pool.query(
      'SELECT * FROM rfqs WHERE id = $1 AND buyer_id = $2',
      [id, req.user.id]
    );

    if (!rfq.rows.length) {
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }

    if (rfq.rows[0].status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft RFQs can be activated' });
    }

    await pool.query(
      "UPDATE rfqs SET status = 'active', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await ActivityLogService.log({
      rfqId: id,
      eventType: 'rfq_activated',
      actorId: req.user.id,
      actorName: req.user.name,
      description: `Auction activated by ${req.user.name}`
    });

    res.json({ success: true, message: 'RFQ activated successfully' });
  } catch (err) {
    console.error('Activate RFQ error:', err);
    res.status(500).json({ success: false, message: 'Failed to activate RFQ' });
  }
};

const getSuppliersList = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, company_name FROM users WHERE role = 'supplier' AND is_active = true ORDER BY name"
    );
    res.json({ success: true, data: { suppliers: result.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch suppliers' });
  }
};

module.exports = { createRFQ, getAuctions, getAuctionDetails, activateRFQ, getSuppliersList };
