const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createRFQ, getAuctions, getAuctionDetails,
  activateRFQ, getSuppliersList
} = require('../controllers/rfqController');
const { submitBid, getBids, getActivityLogs } = require('../controllers/bidController');

router.get('/suppliers/list', authenticate, authorize('buyer', 'admin'), getSuppliersList);
router.post('/', authenticate, authorize('buyer', 'admin'), createRFQ);
router.get('/', authenticate, getAuctions);
router.get('/:id', authenticate, getAuctionDetails);
router.patch('/:id/activate', authenticate, authorize('buyer', 'admin'), activateRFQ);


router.post('/:rfqId/bids', authenticate, authorize('supplier'), submitBid);
router.get('/:rfqId/bids', authenticate, getBids);
router.get('/:rfqId/activity', authenticate, getActivityLogs);

module.exports = router;
