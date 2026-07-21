import { Router } from 'express';
import Ride from '../models/Ride.js';
import Child from '../models/Child.js';
import User from '../models/User.js';
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
      // Only paid / active work — hide unpaid pending_payment bookings
      rides = await findRidesPopulated({
        $or: [
          {
            driverId: req.user.id,
            status: { $in: ['assigned', 'in_transit', 'completed', 'open'] },
          },
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

function parseCoords(input) {
  if (!input || typeof input !== 'object') return null;
  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lng, lat };
}

const TRAIL_MAX = 400;

router.post('/', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const {
      childId,
      pickup,
      dropoff,
      pickupCoords,
      dropoffCoords,
      date,
      time,
      tripType = 'pickup',
      fareCents = 250000,
      instant = false,
      driverId = null,
    } = req.body || {};

    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const child = await Child.findOne({
      _id: childId,
      parentId: req.user.id,
    });
    if (!child) return res.status(400).json({ error: 'Invalid child' });

    // Optional preferred driver — parent may pick any active (non-suspended) driver
    let preferredDriverId = null;
    if (driverId) {
      const driver = await User.findOne({
        _id: driverId,
        role: 'driver',
        suspended: { $ne: true },
      });
      if (!driver) {
        return res.status(400).json({
          error: 'Selected driver is not available. Pick another driver.',
        });
      }
      preferredDriverId = driver._id;
    }

    const parent = await User.findById(req.user.id).select(
      'homeAddress homeCoords',
    );

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const rideDate =
      date ||
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const rideTime =
      time || `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let ridePickup = pickup;
    let rideDropoff = dropoff;
    let fromCoords = parseCoords(pickupCoords);
    let toCoords = parseCoords(dropoffCoords);

    // Instant rides fill sensible defaults when locations are omitted
    if (instant) {
      ridePickup =
        ridePickup ||
        parent?.homeAddress ||
        `Home · pickup for ${child.name}`;
      rideDropoff =
        rideDropoff || `${child.school || 'School'} · main gate`;
      if (!fromCoords && parent?.homeCoords?.lng != null) {
        fromCoords = {
          lng: parent.homeCoords.lng,
          lat: parent.homeCoords.lat,
        };
      }
    }

    if (!ridePickup || !rideDropoff) {
      return res.status(400).json({
        error: 'childId, pickup, dropoff, date, and time are required',
      });
    }

    // Lagos-area fallbacks so maps always have anchors
    if (!fromCoords) fromCoords = { lng: 3.4734, lat: 6.4474 };
    if (!toCoords) toCoords = { lng: 3.4219, lat: 6.4281 };

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const created = await Ride.create({
      parentId: req.user.id,
      childId: child._id,
      childName: child.name,
      driverId: preferredDriverId,
      pickup: String(ridePickup).trim(),
      dropoff: String(rideDropoff).trim(),
      pickupCoords: fromCoords,
      dropoffCoords: toCoords,
      driverLocation: {
        lng: fromCoords.lng,
        lat: fromCoords.lat,
        heading: 0,
        updatedAt: null,
      },
      trail: [],
      rideDate,
      rideTime,
      tripType: instant ? tripType || 'pickup' : tripType,
      status: 'pending_payment',
      fareCents: Number(fareCents) || (instant ? 300000 : 250000),
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

/** Driver (or admin) pushes GPS; parents read via GET / map socket */
router.post('/:id/location', requireAuth, async (req, res) => {
  try {
    const coords = parseCoords(req.body);
    if (!coords) {
      return res.status(400).json({ error: 'lng and lat are required' });
    }
    const heading = Number(req.body?.heading) || 0;

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const isDriver = ride.driverId?.toString() === req.user.id;
    if (req.user.role !== 'admin' && !isDriver) {
      return res.status(403).json({ error: 'Only the assigned driver can update location' });
    }

    const now = new Date();
    ride.driverLocation = {
      lng: coords.lng,
      lat: coords.lat,
      heading,
      updatedAt: now,
    };

    const trail = Array.isArray(ride.trail) ? ride.trail : [];
    const last = trail[trail.length - 1];
    const movedEnough =
      !last ||
      Math.abs(last.lng - coords.lng) > 0.00002 ||
      Math.abs(last.lat - coords.lat) > 0.00002;
    if (movedEnough) {
      trail.push({ lng: coords.lng, lat: coords.lat, at: now });
      if (trail.length > TRAIL_MAX) {
        ride.trail = trail.slice(trail.length - TRAIL_MAX);
      } else {
        ride.trail = trail;
      }
    }

    await ride.save();

    // Keep driver's last known position for live maps
    await User.findByIdAndUpdate(req.user.id, {
      lastLocation: {
        lng: coords.lng,
        lat: coords.lat,
        heading,
        updatedAt: now,
      },
    });

    const payload = {
      rideId: ride._id.toString(),
      lng: coords.lng,
      lat: coords.lat,
      heading,
      updatedAt: now,
      trail: ride.trail.map((p) => ({
        lng: p.lng,
        lat: p.lat,
        at: p.at,
      })),
    };

    const io = req.app.get('io');
    if (io) io.to(`ride:${ride._id}`).emit('ride:location', payload);

    res.json({
      driverLocation: {
        lng: coords.lng,
        lat: coords.lat,
        heading,
        updatedAt: now,
      },
      trail: payload.trail,
    });
  } catch (err) {
    console.error('[rides location POST]', err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.get('/:id/location', requireAuth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select(
      'parentId driverId pickupCoords dropoffCoords driverLocation trail pickup dropoff status',
    );
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const parentId = ride.parentId?.toString();
    const driverId = ride.driverId?.toString();
    if (
      req.user.role !== 'admin' &&
      parentId !== req.user.id &&
      driverId !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      status: ride.status,
      pickupCoords:
        ride.pickupCoords?.lng != null
          ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
          : null,
      dropoffCoords:
        ride.dropoffCoords?.lng != null
          ? { lng: ride.dropoffCoords.lng, lat: ride.dropoffCoords.lat }
          : null,
      driverLocation:
        ride.driverLocation?.lng != null
          ? {
              lng: ride.driverLocation.lng,
              lat: ride.driverLocation.lat,
              heading: ride.driverLocation.heading || 0,
              updatedAt: ride.driverLocation.updatedAt,
            }
          : null,
      trail: Array.isArray(ride.trail)
        ? ride.trail.map((p) => ({ lng: p.lng, lat: p.lat, at: p.at }))
        : [],
    });
  } catch (err) {
    console.error('[rides location GET]', err);
    res.status(500).json({ error: 'Failed to get location' });
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
