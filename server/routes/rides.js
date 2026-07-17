import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

function mapRide(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    driverId: row.driver_id,
    childId: row.child_id,
    childName: row.child_name,
    pickup: row.pickup,
    dropoff: row.dropoff,
    date: row.ride_date,
    time: row.ride_time,
    tripType: row.trip_type,
    status: row.status,
    fareCents: row.fare_cents,
    currency: row.currency,
    handoverPin: row.handover_pin,
    paymentStatus: row.payment_status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentName: row.parent_name,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    vehiclePlate: row.vehicle_plate,
    parentPhone: row.parent_phone,
  };
}

const rideSelect = `
  SELECT r.*,
    p.name AS parent_name,
    p.phone AS parent_phone,
    d.name AS driver_name,
    d.phone AS driver_phone,
    d.vehicle_plate AS vehicle_plate
  FROM rides r
  LEFT JOIN users p ON p.id = r.parent_id
  LEFT JOIN users d ON d.id = r.driver_id
`;

router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'parent') {
    rows = db.prepare(`${rideSelect} WHERE r.parent_id = ? ORDER BY r.created_at DESC`).all(req.user.id);
  } else if (req.user.role === 'driver') {
    rows = db
      .prepare(`${rideSelect} WHERE r.driver_id = ? OR (r.status = 'open' AND r.driver_id IS NULL) ORDER BY r.created_at DESC`)
      .all(req.user.id);
  } else {
    rows = db.prepare(`${rideSelect} ORDER BY r.created_at DESC LIMIT 100`).all();
  }
  res.json({ rides: rows.map(mapRide) });
});

router.get('/available', requireAuth, requireRole('driver'), (req, res) => {
  const rows = db
    .prepare(`${rideSelect} WHERE r.status = 'open' AND r.driver_id IS NULL ORDER BY r.created_at DESC`)
    .all();
  res.json({ rides: rows.map(mapRide) });
});

router.get('/active', requireAuth, (req, res) => {
  let row;
  if (req.user.role === 'parent') {
    row = db
      .prepare(`${rideSelect} WHERE r.parent_id = ? AND r.status IN ('open','assigned','in_transit') ORDER BY r.updated_at DESC LIMIT 1`)
      .get(req.user.id);
  } else if (req.user.role === 'driver') {
    row = db
      .prepare(`${rideSelect} WHERE r.driver_id = ? AND r.status IN ('assigned','in_transit') ORDER BY r.updated_at DESC LIMIT 1`)
      .get(req.user.id);
  }
  res.json({ ride: mapRide(row) });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`${rideSelect} WHERE r.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ride not found' });

  if (
    req.user.role !== 'admin' &&
    row.parent_id !== req.user.id &&
    row.driver_id !== req.user.id
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ ride: mapRide(row) });
});

router.post('/', requireAuth, requireRole('parent'), (req, res) => {
  const {
    childId,
    pickup,
    dropoff,
    date,
    time,
    tripType = 'pickup',
    fareCents = 250000,
  } = req.body || {};

  if (!childId || !pickup || !dropoff || !date || !time) {
    return res.status(400).json({ error: 'childId, pickup, dropoff, date, and time are required' });
  }

  const child = db
    .prepare('SELECT * FROM children WHERE id = ? AND parent_id = ?')
    .get(childId, req.user.id);
  if (!child) return res.status(400).json({ error: 'Invalid child' });

  const id = `ride_${uuid().slice(0, 8)}`;
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  db.prepare(`
    INSERT INTO rides (
      id, parent_id, child_id, child_name, pickup, dropoff,
      ride_date, ride_time, trip_type, status, fare_cents, currency,
      handover_pin, payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, 'ngn', ?, 'unpaid')
  `).run(
    id,
    req.user.id,
    child.id,
    child.name,
    String(pickup).trim(),
    String(dropoff).trim(),
    date,
    time,
    tripType,
    Number(fareCents) || 250000,
    pin,
  );

  const row = db.prepare(`${rideSelect} WHERE r.id = ?`).get(id);
  res.status(201).json({ ride: mapRide(row) });
});

router.post('/:id/accept', requireAuth, requireRole('driver'), (req, res) => {
  const row = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ride not found' });
  if (row.status !== 'open' || row.driver_id) {
    return res.status(400).json({ error: 'Ride is not available' });
  }

  db.prepare(`
    UPDATE rides SET driver_id = ?, status = 'assigned', updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, row.id);

  const updated = db.prepare(`${rideSelect} WHERE r.id = ?`).get(row.id);
  res.json({ ride: mapRide(updated) });
});

router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['assigned', 'in_transit', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const row = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ride not found' });

  const isParent = row.parent_id === req.user.id;
  const isDriver = row.driver_id === req.user.id;
  if (req.user.role !== 'admin' && !isParent && !isDriver) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare(`UPDATE rides SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    row.id,
  );
  const updated = db.prepare(`${rideSelect} WHERE r.id = ?`).get(row.id);
  res.json({ ride: mapRide(updated) });
});

export default router;
