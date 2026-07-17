import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function canAccessRide(user, ride) {
  if (!ride) return false;
  if (user.role === 'admin') return true;
  return ride.parent_id === user.id || ride.driver_id === user.id;
}

function mapMessage(row) {
  return {
    id: row.id,
    rideId: row.ride_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

router.get('/:rideId/messages', requireAuth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
  if (!canAccessRide(req.user, ride)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const rows = db
    .prepare(`
      SELECT m.*, u.name AS sender_name, u.role AS sender_role
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.ride_id = ?
      ORDER BY m.created_at ASC
      LIMIT 200
    `)
    .all(req.params.rideId);

  res.json({ messages: rows.map(mapMessage) });
});

router.post('/:rideId/messages', requireAuth, (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) {
    return res.status(400).json({ error: 'Message body is required' });
  }

  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
  if (!canAccessRide(req.user, ride)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Allow chat once paid/open or assigned
  if (!['open', 'assigned', 'in_transit', 'completed'].includes(ride.status) && ride.payment_status !== 'paid') {
    return res.status(400).json({ error: 'Chat available after booking is paid' });
  }

  const id = `msg_${uuid().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO messages (id, ride_id, sender_id, body)
    VALUES (?, ?, ?, ?)
  `).run(id, ride.id, req.user.id, body.trim());

  const row = db
    .prepare(`
      SELECT m.*, u.name AS sender_name, u.role AS sender_role
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `)
    .get(id);

  const message = mapMessage(row);

  // Emit via socket if available
  const io = req.app.get('io');
  if (io) {
    io.to(`ride:${ride.id}`).emit('chat:message', message);
  }

  res.status(201).json({ message });
});

export default router;
