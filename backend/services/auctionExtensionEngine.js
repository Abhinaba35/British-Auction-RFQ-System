const pool = require('../config/database');
const ActivityLogService = require('./activityLogService');

class AuctionExtensionEngine {

  /**
   * Main entry point - called after every bid submission
   *
   * @param {string} rfqId - The RFQ ID
   * @param {string} newBidId - The newly submitted bid ID
   * @param {Object} rankInfo - { oldL1SupplierId, newL1SupplierId, rankChanged }
   * @param {Object} client - DB transaction client
   * @returns {Object} { extended: boolean, newCloseTime: Date, reason: string }
   */
  static async evaluateAndExtend(rfqId, newBidId, rankInfo, client) {

    const result = await client.query(
      `SELECT r.bid_close_time, r.forced_close_time, r.status,
              ac.trigger_window_minutes, ac.extension_duration_minutes,
              ac.extension_trigger_type, ac.max_extensions, ac.extension_count
       FROM rfqs r
       JOIN auction_configs ac ON ac.rfq_id = r.id
       WHERE r.id = $1`,
      [rfqId]
    );

    if (!result.rows.length) {
      throw new Error('RFQ or auction config not found');
    }

    const config = result.rows[0];
    const now = new Date();
    const currentCloseTime = new Date(config.bid_close_time);
    const forcedCloseTime = new Date(config.forced_close_time);

    if (config.status !== 'active') {
      return { extended: false, reason: 'Auction is not active' };
    }

    if (config.max_extensions !== null && config.extension_count >= config.max_extensions) {
      return { extended: false, reason: 'Maximum extensions reached' };
    }

    if (now >= forcedCloseTime) {
      return { extended: false, reason: 'Forced close time reached' };
    }

    const triggerWindowMs = config.trigger_window_minutes * 60 * 1000;
    const windowStartTime = new Date(currentCloseTime.getTime() - triggerWindowMs);

    const isInTriggerWindow = now >= windowStartTime && now <= currentCloseTime;

    if (!isInTriggerWindow) {
      return { extended: false, reason: 'Outside trigger window' };
    }

    const triggerResult = await this.evaluateTriggerCondition(
      config.extension_trigger_type,
      rfqId,
      rankInfo,
      client
    );

    if (!triggerResult.triggered) {
      return { extended: false, reason: triggerResult.reason };
    }

    const extensionMs = config.extension_duration_minutes * 60 * 1000;
    let newCloseTime = new Date(currentCloseTime.getTime() + extensionMs);

    if (newCloseTime > forcedCloseTime) {
      newCloseTime = forcedCloseTime;
    }

    if (newCloseTime <= currentCloseTime) {
      return { extended: false, reason: 'Extension would not move close time forward' };
    }

    const newExtensionCount = config.extension_count + 1;

    await client.query(
      `UPDATE rfqs SET bid_close_time = $1, updated_at = NOW() WHERE id = $2`,
      [newCloseTime, rfqId]
    );

    await client.query(
      `UPDATE auction_configs SET extension_count = $1, updated_at = NOW() WHERE rfq_id = $2`,
      [newExtensionCount, rfqId]
    );

    await ActivityLogService.logAuctionExtended({
      rfqId,
      oldCloseTime: currentCloseTime,
      newCloseTime,
      reason: triggerResult.reason,
      extensionCount: newExtensionCount
    }, client);

    return {
      extended: true,
      newCloseTime,
      oldCloseTime: currentCloseTime,
      reason: triggerResult.reason,
      extensionCount: newExtensionCount
    };
  }

  /**
   * Evaluate which trigger condition is met
   *
   * @param {string} triggerType - 'bid_received' | 'any_rank_change' | 'l1_rank_change'
   * @param {string} rfqId
   * @param {Object} rankInfo - Rank change context passed from bid submission
   * @param {Object} client
   */
  static async evaluateTriggerCondition(triggerType, rfqId, rankInfo, client) {
    switch (triggerType) {

      case 'bid_received':

        return { triggered: true, reason: 'Bid received in trigger window' };

      case 'any_rank_change':
        
        if (rankInfo.rankChanged) {
          return { triggered: true, reason: 'Supplier rank changed in trigger window' };
        }
        return { triggered: false, reason: 'No rank change occurred' };

      case 'l1_rank_change':
       
        if (rankInfo.l1Changed) {
          return { triggered: true, reason: 'L1 (lowest bidder) changed in trigger window' };
        }
        return { triggered: false, reason: 'L1 did not change' };

      default:
        return { triggered: false, reason: 'Unknown trigger type' };
    }
  }

  /**
   * Recalculate and update rankings for all active bids in an RFQ
   *
   * @param {string} rfqId
   * @param {Object} client - DB transaction client
   * @returns {Object} { oldRankings: Map, newRankings: Map, l1Changed: boolean, rankChanged: boolean }
   */
  static async recalculateRankings(rfqId, client) {
    const beforeResult = await client.query(
      `SELECT DISTINCT ON (supplier_id) id, supplier_id, total_price, rank
       FROM bids
       WHERE rfq_id = $1 AND is_active = true
       ORDER BY supplier_id, submitted_at DESC`,
      [rfqId]
    );

    const oldRankings = new Map(beforeResult.rows.map(b => [b.supplier_id, b.rank]));
    const oldL1 = beforeResult.rows
      .sort((a, b) => Number(a.total_price) - Number(b.total_price))[0]?.supplier_id;

    await client.query(
      `UPDATE bids SET is_active = false
       WHERE rfq_id = $1
         AND id NOT IN (
           SELECT DISTINCT ON (supplier_id) id
           FROM bids
           WHERE rfq_id = $1
           ORDER BY supplier_id, submitted_at DESC
         )`,
      [rfqId]
    );

    const rankResult = await client.query(
      `SELECT id, supplier_id, total_price,
              RANK() OVER (ORDER BY total_price ASC) AS new_rank
       FROM bids
       WHERE rfq_id = $1 AND is_active = true`,
      [rfqId]
    );

    for (const bid of rankResult.rows) {
      await client.query(
        `UPDATE bids SET rank = $1, updated_at = NOW() WHERE id = $2`,
        [bid.new_rank, bid.id]
      );
    }

    const newRankings = new Map(rankResult.rows.map(b => [b.supplier_id, Number(b.new_rank)]));
    const newL1 = rankResult.rows
      .sort((a, b) => Number(a.total_price) - Number(b.total_price))[0]?.supplier_id;

    let rankChanged = false;
    for (const [supplierId, newRank] of newRankings) {
      if (oldRankings.get(supplierId) !== newRank) {
        rankChanged = true;
        break;
      }
    }

    const l1Changed = oldL1 !== newL1;

    return { oldRankings, newRankings, l1Changed, rankChanged };
  }
}

module.exports = AuctionExtensionEngine;
