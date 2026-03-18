require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const net = require('net');

const app = express();
const server = http.createServer(app);

// ── Allowed origins (single source of truth) ───────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://british-auction-rfq-system.vercel.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

// ── Socket.io setup ────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Attach io to app so controllers can emit events
app.set('io', io);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
      "http://localhost:3000",
      "https://british-auction-rfq-system.vercel.app"
    ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Ensure OPTIONS preflight is handled for all routes
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rfqs', require('./routes/rfq'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ── 404 & Error handlers ────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Socket.io realtime ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Client joins a specific auction room for real-time updates
  socket.on('join_auction', (rfqId) => {
    socket.join(`auction:${rfqId}`);
    console.log(`Socket ${socket.id} joined auction:${rfqId}`);
  });

  socket.on('leave_auction', (rfqId) => {
    socket.leave(`auction:${rfqId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ── Auction status auto-update cron (every 30s) ─────────────────────────────────
const pool = require('./config/database');
setInterval(async () => {
  try {
    const now = new Date();

    // Force close expired auctions
    const forceClosed = await pool.query(
      `UPDATE rfqs SET status = 'force_closed', updated_at = NOW()
       WHERE status = 'active' AND forced_close_time <= $1
       RETURNING id`,
      [now]
    );

    // Close auctions past bid close time
    const closed = await pool.query(
      `UPDATE rfqs SET status = 'closed', updated_at = NOW()
       WHERE status = 'active' AND bid_close_time <= $1 AND forced_close_time > $1
       RETURNING id`,
      [now]
    );

    // Activate scheduled auctions
    const activated = await pool.query(
      `UPDATE rfqs SET status = 'active', updated_at = NOW()
       WHERE status = 'draft' AND bid_start_time <= $1
       RETURNING id`,
      [now]
    );

    // Emit status updates via socket
    [...forceClosed.rows, ...closed.rows, ...activated.rows].forEach(({ id }) => {
      io.to(`auction:${id}`).emit('auction_status_changed', { rfqId: id });
    });

  } catch (err) {
    console.error('Status sync error:', err.message);
  }
}, 30000);

// ── Start server ────────────────────────────────────────────────────────────────
const BASE_PORT = Number(process.env.PORT) || 5000;
const MAX_PORT_TRIES = Number(process.env.MAX_PORT_TRIES) || 10;

function logStarted(port) {
  console.log(`
  🚀 British Auction RFQ Server
  ─────────────────────────────
  Port    : ${port}
  Mode    : ${process.env.NODE_ENV || 'development'}
  API     : http://localhost:${port}/api
  Health  : http://localhost:${port}/api/health
  `);
}

function canBindToPort(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function startServer() {
  let port = BASE_PORT;
  for (let i = 0; i < MAX_PORT_TRIES; i++) {
    const ok = await canBindToPort(port);
    if (ok) break;
    const nextPort = port + 1;
    console.warn(`Port ${port} in use. Trying ${nextPort}...`);
    port = nextPort;
  }

  server.listen(port, () => logStarted(port));
  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

startServer();

module.exports = { app, io };