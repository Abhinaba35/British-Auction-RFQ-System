const pool = require('../config/database');
const AuctionExtensionEngine = require('../services/auctionExtensionEngine');
const ActivityLogService = require('../services/activityLogService');

const submitBid = async (req, res) => {
  const client = await pool.connect();
  try {
    const { rfqId } = req.params;
    const {
      carrier_name, freight_charges, origin_charges = 0,
      destination_charges = 0, transit_time_days, quote_validity_date, notes
    } = req.body;

    // Validate required fields
    if (!carrier_name || freight_charges === undefined || !transit_time_days || !quote_validity_date) {
      return res.status(400).json({ success: false, message: 'Missing required bid fields' });
    }

    if (Number(freight_charges) < 0 || Number(origin_charges) < 0 || Number(destination_charges) < 0) {
      return res.status(400).json({ success: false, message: 'Charges cannot be negative' });
    }

    // Load and validate RFQ 
    const rfqResult = await pool.query(
      `SELECT r.*, ac.trigger_window_minutes, ac.extension_trigger_type
       FROM rfqs r
       JOIN auction_configs ac ON ac.rfq_id = r.id
       WHERE r.id = $1`,
      [rfqId]
    );

    if (!rfqResult.rows.length) {
      return res.status(404).json({ success: false, message: 'RFQ not found' });
    }

    const rfq = rfqResult.rows[0];
    const now = new Date();

    if (rfq.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Cannot bid on a ${rfq.status} auction`
      });
    }

    if (now < new Date(rfq.bid_start_time)) {
      return res.status(400).json({ success: false, message: 'Bidding has not started yet' });
    }

    if (now > new Date(rfq.forced_close_time)) {
      return res.status(400).json({ success: false, message: 'Auction has been force closed' });
    }

    if (now > new Date(rfq.bid_close_time)) {
      return res.status(400).json({ success: false, message: 'Auction has closed' });
    }

    const inviteCheck = await pool.query(
      'SELECT id FROM rfq_suppliers WHERE rfq_id = $1 AND supplier_id = $2',
      [rfqId, req.user.id]
    );
   
    const hasInvitedSuppliers = await pool.query(
      'SELECT COUNT(*) FROM rfq_suppliers WHERE rfq_id = $1',
      [rfqId]
    );
    if (Number(hasInvitedSuppliers.rows[0].count) > 0 && !inviteCheck.rows.length) {
      return res.status(403).json({ success: false, message: 'You are not invited to bid on this RFQ' });
    }

    await client.query('BEGIN');

    // Get current L1 before bid 
    const prevL1Result = await client.query(
      `SELECT supplier_id FROM bids WHERE rfq_id = $1 AND is_active = true ORDER BY total_price ASC LIMIT 1`,
      [rfqId]
    );
    const prevL1SupplierId = prevL1Result.rows[0]?.supplier_id || null;

    // Get supplier's current best bid rank 
    const prevBidResult = await client.query(
      `SELECT rank FROM bids WHERE rfq_id = $1 AND supplier_id = $2 AND is_active = true ORDER BY submitted_at DESC LIMIT 1`,
      [rfqId, req.user.id]
    );
    const previousRank = prevBidResult.rows[0]?.rank || null;

    //  Insert new bid
    const bidResult = await client.query(
      `INSERT INTO bids (rfq_id, supplier_id, carrier_name, freight_charges, origin_charges,
        destination_charges, transit_time_days, quote_validity_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [rfqId, req.user.id, carrier_name, freight_charges, origin_charges,
       destination_charges, transit_time_days, quote_validity_date, notes]
    );

    const bid = bidResult.rows[0];

    //  Recalculate all rankings
    const rankInfo = await AuctionExtensionEngine.recalculateRankings(rfqId, client);
    const newRank = rankInfo.newRankings.get(req.user.id);

    // Log the bid 
    await ActivityLogService.logBidSubmitted({
      rfqId,
      actorId: req.user.id,
      actorName: req.user.name,
      bidId: bid.id,
      totalPrice: Number(freight_charges) + Number(origin_charges) + Number(destination_charges),
      rank: newRank,
      previousRank
    }, client);

  
    for (const [supplierId, newSupplierRank] of rankInfo.newRankings) {
      const oldRank = rankInfo.oldRankings.get(supplierId);
      if (oldRank && oldRank !== newSupplierRank && supplierId !== req.user.id) {
        const supplierInfo = await client.query(
          'SELECT name FROM users WHERE id = $1',
          [supplierId]
        );
        if (supplierInfo.rows.length) {
          await ActivityLogService.logRankChanged({
            rfqId,
            supplierId,
            supplierName: supplierInfo.rows[0].name,
            oldRank,
            newRank: newSupplierRank
          }, client);
        }
      }
    }

    // Evaluate auction extension 
    const extensionResult = await AuctionExtensionEngine.evaluateAndExtend(
      rfqId,
      bid.id,
      rankInfo,
      client
    );

    await client.query('COMMIT');

   
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${rfqId}`).emit('bid_submitted', {
        rfqId,
        supplierId: req.user.id,
        rank: newRank
      });

      if (extensionResult.extended) {
        io.to(`auction:${rfqId}`).emit('auction_extended', {
          rfqId,
          newCloseTime: extensionResult.newCloseTime,
          oldCloseTime: extensionResult.oldCloseTime,
          reason: extensionResult.reason,
          extensionCount: extensionResult.extensionCount
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Bid submitted successfully',
      data: {
        bid: { ...bid, rank: newRank },
        extension: extensionResult
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit bid error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit bid' });
  } finally {
    client.release();
  }
};


const getBids = async (req, res) => {
  try {
    const { rfqId } = req.params;

    const result = await pool.query(
      `SELECT b.id, b.carrier_name, b.freight_charges, b.origin_charges,
              b.destination_charges, b.total_price, b.transit_time_days,
              b.quote_validity_date, b.rank, b.notes, b.submitted_at, b.is_active,
              u.name AS supplier_name, u.company_name AS supplier_company,
              u.id AS supplier_id
       FROM bids b
       JOIN users u ON u.id = b.supplier_id
       WHERE b.rfq_id = $1 AND b.is_active = true
       ORDER BY b.total_price ASC`,
      [rfqId]
    );

    res.json({ success: true, data: { bids: result.rows } });
  } catch (err) {
    console.error('Get bids error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch bids' });
  }
};


const getActivityLogs = async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { limit = 50 } = req.query;

    const result = await pool.query(
      `SELECT al.*, u.company_name AS actor_company
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.rfq_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [rfqId, limit]
    );

    res.json({ success: true, data: { logs: result.rows } });
  } catch (err) {
    console.error('Get activity logs error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
};

module.exports = { submitBid, getBids, getActivityLogs };
