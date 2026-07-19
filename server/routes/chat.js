import { Router } from 'express';
import Ride from '../models/Ride.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { mapMessage } from '../utils/mappers.js';

const router = Router();

function canAccessRide(user, ride) {
  if (!ride) return false;
  if (user.role === 'admin') return true;
  const parentId = ride.parentId?.toString?.() || String(ride.parentId);
  const driverId = ride.driverId?.toString?.() || String(ride.driverId || '');
  return parentId === user.id || driverId === user.id;
}

router.get('/:rideId/messages', requireAuth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!canAccessRide(req.user, ride)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const messages = await Message.find({ rideId: ride._id })
      .populate('senderId', 'name role')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({
      messages: messages.map((m) => mapMessage(m, m.senderId)),
    });
  } catch (err) {
    console.error('[chat GET]', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/:rideId/messages', requireAuth, async (req, res) => {
  try {
    const { body } = req.body || {};
    if (!body?.trim()) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    const ride = await Ride.findById(req.params.rideId);
    if (!canAccessRide(req.user, ride)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (
      !['open', 'assigned', 'in_transit', 'completed'].includes(ride.status) &&
      ride.paymentStatus !== 'paid'
    ) {
      return res
        .status(400)
        .json({ error: 'Chat available after booking is paid' });
    }

    const created = await Message.create({
      rideId: ride._id,
      senderId: req.user.id,
      body: body.trim(),
    });

    const populated = await Message.findById(created._id).populate(
      'senderId',
      'name role',
    );
    const message = mapMessage(populated, populated.senderId);

    const io = req.app.get('io');
    if (io) {
      io.to(`ride:${ride._id.toString()}`).emit('chat:message', message);
    }

    res.status(201).json({ message });
  } catch (err) {
    console.error('[chat POST]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
