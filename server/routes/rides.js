import { Router } from 'express';
import Ride from '../models/Ride.js';
import Child from '../models/Child.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { mapRide } from '../utils/mappers.js';

const router = Router();

async function findRidePopulated(filter) {
  return Ride.findOne(filter)
    .populate('parentId', 'name phone')
    .populate('driverId', 'name phone vehiclePlate');
}

async function findRidesPopulated(filter, options = {}) {
  let q = Ride.find(filter)
    .populate('parentId', 'name phone')
    .populate('driverId', 'name phone vehiclePlate')
    .sort({ createdAt: -1 });
  if (options.limit) q = q.limit(options.limit);
  return q;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    let rides;
    if (req.user.role === 'parent') {
      rides = await findRidesPopulated({ parentId: req.user.id });
    } else if (req.user.role === 'driver') {
      rides = await findRidesPopulated({
        $or: [
          { driverId: req.user.id },
          { status: 'open', driverId: null },
        ],
      });
    } else {
      rides = await findRidesPopulated({}, { limit: 100 });
    }
    res.json({ rides: rides.map((r) => mapRide(r)) });
  } catch (err) {
    console.error('[rides GET]', err);
    res.status(500).json({ error: 'Failed to list rides' });
  }
});

router.get('/available', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const rides = await findRidesPopulated({
      status: 'open',
      driverId: null,
    });
    res.json({ rides: rides.map((r) => mapRide(r)) });
  } catch (err) {
    console.error('[rides/available]', err);
    res.status(500).json({ error: 'Failed to list available rides' });
  }
});

router.get('/active', requireAuth, async (req, res) => {
  try {
    let ride = null;
    if (req.user.role === 'parent') {
      ride = await Ride.findOne({
        parentId: req.user.id,
        status: { $in: ['open', 'assigned', 'in_transit'] },
      })
        .sort({ updatedAt: -1 })
        .populate('parentId', 'name phone')
        .populate('driverId', 'name phone vehiclePlate');
    } else if (req.user.role === 'driver') {
      ride = await Ride.findOne({
        driverId: req.user.id,
        status: { $in: ['assigned', 'in_transit'] },
      })
        .sort({ updatedAt: -1 })
        .populate('parentId', 'name phone')
        .populate('driverId', 'name phone vehiclePlate');
    }
    res.json({ ride: mapRide(ride) });
  } catch (err) {
    console.error('[rides/active]', err);
    res.status(500).json({ error: 'Failed to get active ride' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const ride = await findRidePopulated({ _id: req.params.id });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const parentId = ride.parentId?._id?.toString() || ride.parentId?.toString();
    const driverId = ride.driverId?._id?.toString() || ride.driverId?.toString();

    if (
      req.user.role !== 'admin' &&
      parentId !== req.user.id &&
      driverId !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ ride: mapRide(ride) });
  } catch (err) {
    console.error('[rides GET :id]', err);
    res.status(500).json({ error: 'Failed to get ride' });
  }
});

router.post('/', requireAuth, requireRole('parent'), async (req, res) => {
  try {
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
      return res.status(400).json({
        error: 'childId, pickup, dropoff, date, and time are required',
      });
    }

    const child = await Child.findOne({
      _id: childId,
      parentId: req.user.id,
    });
    if (!child) return res.status(400).json({ error: 'Invalid child' });

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const created = await Ride.create({
      parentId: req.user.id,
      childId: child._id,
      childName: child.name,
      pickup: String(pickup).trim(),
      dropoff: String(dropoff).trim(),
      rideDate: date,
      rideTime: time,
      tripType,
      status: 'pending_payment',
      fareCents: Number(fareCents) || 250000,
      currency: 'ngn',
      handoverPin: pin,
      paymentStatus: 'unpaid',
    });

    const ride = await findRidePopulated({ _id: created._id });
    res.status(201).json({ ride: mapRide(ride) });
  } catch (err) {
    console.error('[rides POST]', err);
    res.status(500).json({ error: 'Failed to create ride' });
  }
});

router.post('/:id/accept', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'open' || ride.driverId) {
      return res.status(400).json({ error: 'Ride is not available' });
    }

    ride.driverId = req.user.id;
    ride.status = 'assigned';
    await ride.save();

    const updated = await findRidePopulated({ _id: ride._id });
    res.json({ ride: mapRide(updated) });
  } catch (err) {
    console.error('[rides accept]', err);
    res.status(500).json({ error: 'Failed to accept ride' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ['assigned', 'in_transit', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const isParent = ride.parentId?.toString() === req.user.id;
    const isDriver = ride.driverId?.toString() === req.user.id;
    if (req.user.role !== 'admin' && !isParent && !isDriver) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    ride.status = status;
    await ride.save();

    const updated = await findRidePopulated({ _id: ride._id });
    res.json({ ride: mapRide(updated) });
  } catch (err) {
    console.error('[rides status]', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
