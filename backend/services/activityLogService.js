const pool = require('../config/database');
class ActivityLogService {

  /**
   * Log any auction event
   * @param {Object} params
   * @param {string} params.rfqId - RFQ UUID
   * @param {string} params.eventType - Event type enum
   * @param {string|null} params.actorId - User ID who triggered event
   * @param {string|null} params.actorName - Display name of actor
   * @param {string} params.description - Human-readable description
   * @param {Object} params.metadata - Extra JSON data
   * @param {Object} [client] - Optional DB client for transaction
   */
  static async log({ rfqId, eventType, actorId = null, actorName = null, description, metadata = {} }, client = null) {
    const db = client || pool;
    try {
      await db.query(
        `INSERT INTO activity_logs (rfq_id, event_type, actor_id, actor_name, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [rfqId, eventType, actorId, actorName, description, JSON.stringify(metadata)]
      );
    } catch (err) {
      console.error('Activity log error:', err.message);
    }
  }

  static async logBidSubmitted({ rfqId, actorId, actorName, bidId, totalPrice, rank, previousRank }, client = null) {
    const rankInfo = rank ? ` | Rank: L${rank}` : '';
    const rankChange = previousRank && previousRank !== rank
      ? ` (was L${previousRank})` : '';

    await this.log({
      rfqId,
      eventType: 'bid_submitted',
      actorId,
      actorName,
      description: `${actorName} submitted a bid of ₹${Number(totalPrice).toLocaleString()}${rankInfo}${rankChange}`,
      metadata: { bidId, totalPrice, rank, previousRank }
    }, client);
  }

  static async logAuctionExtended({ rfqId, oldCloseTime, newCloseTime, reason, extensionCount }, client = null) {
    await this.log({
      rfqId,
      eventType: 'auction_extended',
      actorId: null,
      actorName: 'System',
      description: `Auction extended by ${reason}. New close time: ${new Date(newCloseTime).toLocaleString()}`,
      metadata: {
        oldCloseTime,
        newCloseTime,
        reason,
        extensionCount
      }
    }, client);
  }

  static async logRankChanged({ rfqId, supplierId, supplierName, oldRank, newRank }, client = null) {
    await this.log({
      rfqId,
      eventType: 'rank_changed',
      actorId: supplierId,
      actorName: supplierName,
      description: `${supplierName} rank changed from L${oldRank} to L${newRank}`,
      metadata: { supplierId, oldRank, newRank }
    }, client);
  }

  static async logRfqCreated({ rfqId, actorId, actorName, rfqName, referenceId }, client = null) {
    await this.log({
      rfqId,
      eventType: 'rfq_created',
      actorId,
      actorName,
      description: `RFQ "${rfqName}" (${referenceId}) created by ${actorName}`,
      metadata: { rfqName, referenceId }
    }, client);
  }

  static async logRfqClosed({ rfqId, reason, lowestBid, winnerName }, client = null) {
    await this.log({
      rfqId,
      eventType: reason === 'forced' ? 'rfq_force_closed' : 'rfq_closed',
      actorId: null,
      actorName: 'System',
      description: `Auction ${reason === 'forced' ? 'force closed' : 'closed'}. Lowest bid: ₹${Number(lowestBid || 0).toLocaleString()} by ${winnerName || 'N/A'}`,
      metadata: { reason, lowestBid, winnerName }
    }, client);
  }
}

module.exports = ActivityLogService;
