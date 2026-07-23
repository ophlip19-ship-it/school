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
import { mapMessage, mapTransitRide, pushTransitFeed } from './utils/mappers.js';
import authRoutes from './routes/auth.js';
import childrenRoutes from './routes/children.js';
import ridesRoutes from './routes/rides.js';
import paymentsRoutes from './routes/payments.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import driversRoutes from './routes/drivers.js';

const PORT = Number(process.env.PORT || 5000);
// Comma-separated list supported, e.g. CLIENT_ORIGIN=https://app.vercel.app,http://localhost:3000
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  ...CLIENT_ORIGINS,
  'https://scholrun-api.onrender.com',
  'http://localhost:3000',
  'https://school-enlq.vercel.app',
  'http://127.0.0.1:3000',
].filter(Boolean);

// Deduplicate
const uniqueOrigins = [...new Set(allowedOrigins)];

const io = new Server(server, {
  cors: {
    origin: uniqueOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
});

app.set('io', io);

app.use(
  cors({
    origin: uniqueOrigins,
    credentials: true,
  }),
);
// Larger limit so child photo data URLs can be saved
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'scholrun-api',
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
app.use('/api/drivers', driversRoutes);

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

const TRAIL_MAX = 400;

async function canAccessRide(socketUser, rideId) {
  const ride = await Ride.findById(rideId);
  if (!ride) return null;
  const allowed =
    socketUser.role === 'admin' ||
    ride.parentId?.toString() === socketUser.id ||
    ride.driverId?.toString() === socketUser.id;
  return allowed ? ride : null;
}

io.on('connection', (socket) => {
  socket.on('chat:join', async ({ rideId }) => {
    if (!rideId) return;
    try {
      const ride = await canAccessRide(socket.user, rideId);
      if (!ride) return;
      socket.join(`ride:${rideId}`);
    } catch (err) {
      console.error('[socket chat:join]', err);
    }
  });

  socket.on('ride:join', async ({ rideId }, ack) => {
    if (!rideId) {
      ack?.({ error: 'rideId required' });
      return;
    }
    try {
      const ride = await canAccessRide(socket.user, rideId);
      if (!ride) {
        ack?.({ error: 'Forbidden' });
        return;
      }
      socket.join(`ride:${rideId}`);

      const isParent = ride.parentId?.toString() === socket.user.id;
      const isDriver = ride.driverId?.toString() === socket.user.id;
      const isAdmin = socket.user.role === 'admin';
      // Parent only receives live GPS after pickup confirmation
      const canSeeLive =
        isAdmin ||
        isDriver ||
        (isParent && ride.locationSharing && ride.status === 'in_transit');

      ack?.({
        ok: true,
        status: ride.status,
        locationSharing: !!ride.locationSharing,
        pickedUpAt: ride.pickedUpAt || null,
        deliveredAt: ride.deliveredAt || null,
        driverLocation:
          canSeeLive && ride.driverLocation?.lng != null
            ? {
                lng: ride.driverLocation.lng,
                lat: ride.driverLocation.lat,
                heading: ride.driverLocation.heading || 0,
                updatedAt: ride.driverLocation.updatedAt,
              }
            : null,
        trail:
          canSeeLive && Array.isArray(ride.trail)
            ? ride.trail.map((p) => ({ lng: p.lng, lat: p.lat, at: p.at }))
            : [],
        transitFeed: Array.isArray(ride.transitFeed)
          ? ride.transitFeed.map((e) => ({
              type: e.type,
              message: e.message,
              at: e.at,
              lng: e.lng ?? null,
              lat: e.lat ?? null,
            }))
          : [],
        pickupCoords:
          ride.pickupCoords?.lng != null
            ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
            : null,
        dropoffCoords:
          ride.dropoffCoords?.lng != null
            ? { lng: ride.dropoffCoords.lng, lat: ride.dropoffCoords.lat }
            : null,
      });
    } catch (err) {
      console.error('[socket ride:join]', err);
      ack?.({ error: 'Failed to join' });
    }
  });

  /** Admin fleet map — all in-transit drivers */
  socket.on('admin:transit:join', async (_payload, ack) => {
    try {
      if (socket.user.role !== 'admin') {
        ack?.({ error: 'Forbidden' });
        return;
      }
      socket.join('admin:transit');
      const rides = await Ride.find({
        status: 'in_transit',
        locationSharing: true,
        driverId: { $ne: null },
      })
        .populate('parentId', 'name phone')
        .populate('driverId', 'name phone vehiclePlate')
        .sort({ pickedUpAt: -1, updatedAt: -1 });

      ack?.({
        ok: true,
        rides: rides.map((r) => mapTransitRide(r)),
      });
    } catch (err) {
      console.error('[socket admin:transit:join]', err);
      ack?.({ error: 'Failed to join transit room' });
    }
  });

  socket.on('admin:transit:leave', () => {
    socket.leave('admin:transit');
  });

  socket.on('chat:leave', ({ rideId }) => {
    if (rideId) socket.leave(`ride:${rideId}`);
  });

  socket.on('ride:leave', ({ rideId }) => {
    if (rideId) socket.leave(`ride:${rideId}`);
  });

  /**
   * Driver streams GPS only after confirming pickup (in_transit + locationSharing).
   * Broadcast to parent ride room + admin transit map.
   */
  socket.on('ride:location', async ({ rideId, lng, lat, heading = 0 }, ack) => {
    try {
      const nLng = Number(lng);
      const nLat = Number(lat);
      if (!rideId || !Number.isFinite(nLng) || !Number.isFinite(nLat)) {
        ack?.({ error: 'Invalid location' });
        return;
      }

      const ride = await Ride.findById(rideId);
      if (!ride) {
        ack?.({ error: 'Ride not found' });
        return;
      }

      const isDriver = ride.driverId?.toString() === socket.user.id;
      if (socket.user.role !== 'admin' && !isDriver) {
        ack?.({ error: 'Only the assigned driver can update location' });
        return;
      }

      if (ride.status === 'completed' || ride.status === 'cancelled') {
        ack?.({ error: 'Location sharing has ended', locationSharing: false });
        return;
      }
      if (ride.status !== 'in_transit' || !ride.locationSharing) {
        ack?.({
          error: 'Confirm pickup before sharing location with the parent',
          locationSharing: false,
          status: ride.status,
        });
        return;
      }

      const now = new Date();
      ride.driverLocation = {
        lng: nLng,
        lat: nLat,
        heading: Number(heading) || 0,
        updatedAt: now,
      };

      const trail = Array.isArray(ride.trail) ? [...ride.trail] : [];
      const last = trail[trail.length - 1];
      const movedEnough =
        !last ||
        Math.abs(last.lng - nLng) > 0.00002 ||
        Math.abs(last.lat - nLat) > 0.00002;
      if (movedEnough) {
        trail.push({ lng: nLng, lat: nLat, at: now });
        ride.trail =
          trail.length > TRAIL_MAX
            ? trail.slice(trail.length - TRAIL_MAX)
            : trail;
        if (trail.length === 1 || trail.length % 8 === 0) {
          pushTransitFeed(
            ride,
            'progress',
            `En route to drop-off · ${ride.dropoff}`,
            { lng: nLng, lat: nLat },
          );
        }
      }

      await ride.save();

      await User.findByIdAndUpdate(socket.user.id, {
        lastLocation: {
          lng: nLng,
          lat: nLat,
          heading: Number(heading) || 0,
          updatedAt: now,
        },
      });

      const payload = {
        rideId: ride._id.toString(),
        lng: nLng,
        lat: nLat,
        heading: Number(heading) || 0,
        updatedAt: now,
        locationSharing: true,
        status: ride.status,
        trail: ride.trail.map((p) => ({
          lng: p.lng,
          lat: p.lat,
          at: p.at,
        })),
        transitFeed: (ride.transitFeed || []).map((e) => ({
          type: e.type,
          message: e.message,
          at: e.at,
          lng: e.lng ?? null,
          lat: e.lat ?? null,
        })),
      };

      io.to(`ride:${rideId}`).emit('ride:location', payload);
      io.to('admin:transit').emit('transit:location', {
        ...payload,
        childName: ride.childName,
        driverId: ride.driverId?.toString(),
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        pickupCoords:
          ride.pickupCoords?.lng != null
            ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
            : null,
        dropoffCoords:
          ride.dropoffCoords?.lng != null
            ? { lng: ride.dropoffCoords.lng, lat: ride.dropoffCoords.lat }
            : null,
      });
      ack?.({ ok: true, ...payload });
    } catch (err) {
      console.error('[socket ride:location]', err);
      ack?.({ error: 'Failed to update location' });
    }
  });

  socket.on('chat:send', async ({ rideId, body }, ack) => {
    try {
      if (!rideId || !body?.trim()) {
        ack?.({ error: 'Invalid message' });
        return;
      }
      const ride = await canAccessRide(socket.user, rideId);
      if (!ride) {
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
