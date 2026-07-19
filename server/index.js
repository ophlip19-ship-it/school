import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { connectDb } from './config/db.js';
import { JWT_SECRET } from './middleware/auth.js';
import User from './models/User.js';
import Ride from './models/Ride.js';
import Message from './models/Message.js';
import { mapMessage } from './utils/mappers.js';
import authRoutes from './routes/auth.js';
import childrenRoutes from './routes/children.js';
import ridesRoutes from './routes/rides.js';
import paymentsRoutes from './routes/payments.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';

const PORT = Number(process.env.PORT || 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  CLIENT_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'schoolrun-api',
    db: 'mongodb',
    time: new Date().toISOString(),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    demoPayments: process.env.DEMO_PAYMENTS !== 'false',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// JSON 404 for unknown API paths (avoid Express HTML "Cannot GET …")
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Unauthorized'));
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub).select('name role');
    if (!user) return next(new Error('Unauthorized'));
    socket.user = {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
    };
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', async ({ rideId }) => {
    if (!rideId) return;
    try {
      const ride = await Ride.findById(rideId);
      if (!ride) return;
      const allowed =
        socket.user.role === 'admin' ||
        ride.parentId?.toString() === socket.user.id ||
        ride.driverId?.toString() === socket.user.id;
      if (!allowed) return;
      socket.join(`ride:${rideId}`);
    } catch (err) {
      console.error('[socket chat:join]', err);
    }
  });

  socket.on('chat:leave', ({ rideId }) => {
    if (rideId) socket.leave(`ride:${rideId}`);
  });

  socket.on('chat:send', async ({ rideId, body }, ack) => {
    try {
      if (!rideId || !body?.trim()) {
        ack?.({ error: 'Invalid message' });
        return;
      }
      const ride = await Ride.findById(rideId);
      if (!ride) {
        ack?.({ error: 'Ride not found' });
        return;
      }
      const allowed =
        socket.user.role === 'admin' ||
        ride.parentId?.toString() === socket.user.id ||
        ride.driverId?.toString() === socket.user.id;
      if (!allowed) {
        ack?.({ error: 'Forbidden' });
        return;
      }

      const created = await Message.create({
        rideId: ride._id,
        senderId: socket.user.id,
        body: body.trim(),
      });

      const populated = await Message.findById(created._id).populate(
        'senderId',
        'name role',
      );
      const message = mapMessage(populated, populated.senderId);

      io.to(`ride:${rideId}`).emit('chat:message', message);
      ack?.({ message });
    } catch (err) {
      console.error('[socket chat:send]', err);
      ack?.({ error: 'Failed to send' });
    }
  });
});

async function start() {
  try {
    await connectDb();
    server.listen(PORT, () => {
      console.log(`SchoolRun API listening on http://localhost:${PORT}`);
      console.log(`  health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('[startup] Failed to start server:', err.message);
    console.error(
      '  Ensure MongoDB is running and MONGODB_URI is set correctly.',
    );
    process.exit(1);
  }
}

start();
