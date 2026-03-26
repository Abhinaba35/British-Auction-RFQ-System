# British Auction RFQ System

A full-stack **Request for Quotation** platform with British Auction bidding mechanics.


## Database Schema

```sql
users             — id, name, email, role (buyer/supplier), company_name
rfqs              — id, reference_id, name, bid_start/close/forced times, status
auction_configs   — rfq_id, trigger_window, extension_duration, trigger_type
rfq_suppliers     — rfq_id ↔ supplier_id (invitation list)
bids              — rfq_id, supplier_id, freight/origin/dest charges, total (computed), rank
activity_logs     — rfq_id, event_type, actor, description, metadata (JSONB)
```

---

## Auction Extension Algorithm

```
On every bid submission:
  1. Load rfq.bid_close_time + auction_config
  2. now = current timestamp
  3. window_start = bid_close_time - trigger_window_minutes
  4. IF now NOT in [window_start, bid_close_time] → no extension
  5. Evaluate trigger type:
     • bid_received     → always triggers
     • any_rank_change  → triggers if any supplier rank changed
     • l1_rank_change   → triggers only if L1 changed
  6. IF triggered:
     new_close = bid_close_time + extension_duration_minutes
     new_close = min(new_close, forced_close_time)  ← hard cap
     UPDATE rfqs SET bid_close_time = new_close
     UPDATE auction_configs SET extension_count++
     INSERT activity_logs (event_type: 'auction_extended')
```

---

## Quick Start

### Backend

```bash
cd backend
npm install
cp .env.example .env   
node config/migrate.js  
npm run dev             
```

### Frontend

```bash
cd frontend
npm install
npm start             
```

### Demo Credentials

| Role     | Email                   | Password     |
|----------|-------------------------|--------------|
| Buyer    | buyer@demo.com          | password123  |
| Supplier | supplier1@demo.com      | password123  |
| Supplier | supplier2@demo.com      | password123  |

---

## REST API Reference

| Method | Endpoint                    | Auth     | Description              |
|--------|-----------------------------|----------|--------------------------|
| POST   | /api/auth/register          | Public   | Register new user        |
| POST   | /api/auth/login             | Public   | Login, returns JWT       |
| GET    | /api/auth/me                | Any      | Current user info        |
| GET    | /api/rfqs/suppliers/list    | Buyer    | Get all suppliers        |
| POST   | /api/rfqs                   | Buyer    | Create RFQ               |
| GET    | /api/rfqs                   | Any      | List auctions            |
| GET    | /api/rfqs/:id               | Any      | Auction details + bids   |
| PATCH  | /api/rfqs/:id/activate      | Buyer    | Activate draft RFQ       |
| POST   | /api/rfqs/:id/bids          | Supplier | Submit a bid             |
| GET    | /api/rfqs/:id/bids          | Any      | Get all bids             |
| GET    | /api/rfqs/:id/activity      | Any      | Activity log             |

---

## Real-time Events (Socket.io)

| Event                  | Direction       | Payload                          |
|------------------------|-----------------|----------------------------------|
| `join_auction`         | Client → Server | rfqId                            |
| `leave_auction`        | Client → Server | rfqId                            |
| `bid_submitted`        | Server → Client | { rfqId, supplierId }            |
| `auction_extended`     | Server → Client | { rfqId, newCloseTime, reason }  |
| `auction_status_changed`| Server → Client| { rfqId }                        |

---

## Validation Rules

- Forced close time **must** be greater than bid close time (DB constraint + API)
- Auction extensions **never** exceed forced close time
- Bids can only be submitted while auction is `active` and within time bounds
- Charges cannot be negative
- Suppliers can only bid on RFQs they're invited to (if invitation list exists)

---

## Bonus Feature Suggestions

1. **Fraud Detection** — Flag suspiciously identical bids from the same IP
2. **Bid Analytics** — Chart bid price history over time per RFQ  
3. **Supplier Scorecard** — Win rate, avg price delta, participation count
4. **Email Notifications** — Nodemailer alerts on extension, rank change, auction close
5. **Admin Dashboard** — Full audit trail, user management, override close time
6. **Export to Excel** — Download bid table as CSV/XLSX for procurement records
7. **Multi-currency** — Support USD/EUR/GBP alongside INR

---

## Deployment

### Backend ( Render)
```bash
DATABASE_URL=...
JWT_SECRET=...
FRONTEND_URL=https://british-auction-rfq-system.vercel.app
NODE_ENV=production
```

### Frontend (Vercel)
```bash
REACT_APP_API_URL=https://british-auction-rfq-system.onrender.com/api
REACT_APP_SOCKET_URL=https://british-auction-rfq-system.onrender.com
```
