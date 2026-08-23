import { Router } from 'express';
import Ride from '../models/Ride.js';
import Child from '../models/Child.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  mapRide,
  mapRideForViewer,
  pushTransitFeed,
  mapTransitRide,
} from '../utils/mappers.js';
import {
  calculateFare,
  haversineKm,
  pickNearestDriver,
  pricingDefaults,
} from '../utils/pricing.js';

const router = Router();

/**
 * Active (not suspended) drivers with no assigned/in-transit ride.
 * Optionally ranked by distance to a target point.
 */
async function listAvailableDriversNear(targetCoords = null) {
  const drivers = await User.find({
    role: 'driver',
    suspended: { $ne: true },
  }).lean();

  const free = [];
  for (const d of drivers) {
    const activeCount = await Ride.countDocuments({
      driverId: d._id,
      status: { $in: ['assigned', 'in_transit'] },
    });
    if (activeCount === 0) free.push(d);
  }

  if (!targetCoords || free.length === 0) {
    return free.map((d) => ({
      ...d,
      distanceToPickupKm: null,
    }));
  }

  return free
    .map((d) => {
      const km = haversineKm(d.lastLocation, targetCoords);
      return {
        ...d,
        distanceToPickupKm:
          km != null ? Math.round(km * 100) / 100 : null,
      };
    })
    .sort((a, b) => {
      const da = a.distanceToPickupKm ?? Infinity;
      const db = b.distanceToPickupKm ?? Infinity;
      return da - db;
    });
}

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
      // Paid work: open pool, preferred requests, assigned/in-progress, history
      rides = await findRidesPopulated({
        $or: [
          {
            driverId: req.user.id,
            status: {
              $in: ['requested', 'assigned', 'in_transit', 'completed', 'open'],
            },
          },
          { status: 'open', driverId: null },
        ],
      });
    } else {
      rides = await findRidesPopulated({}, { limit: 100 });
    }
    res.json({ rides: rides.map((r) => mapRideForViewer(r, req.user)) });
  } catch (err) {
    console.error('[rides GET]', err);
    res.status(500).json({ error: 'Failed to list rides' });
  }
});

router.get('/available', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    // Open pool rides + preferred requests for this driver
    const rides = await findRidesPopulated({
      $or: [
        { status: 'open', driverId: null },
        { status: 'requested', driverId: req.user.id },
      ],
    });
    res.json({ rides: rides.map((r) => mapRide(r)) });
  } catch (err) {
    console.error('[rides/available]', err);
    res.status(500).json({ error: 'Failed to list available rides' });
  }
});

router.get('/active', requireAuth, async (req, res) => {
  try {
    // Parents may book and track multiple rides at once (e.g. siblings).
    // Drivers still work one assigned trip at a time.
    if (req.user.role === 'parent') {
      const list = await Ride.find({
        parentId: req.user.id,
        status: {
          $in: [
            'pending_payment',
            'open',
            'requested',
            'assigned',
            'in_transit',
          ],
        },
      })
        .sort({ updatedAt: -1 })
        .populate('parentId', 'name phone')
        .populate('driverId', 'name phone vehiclePlate');

      const rides = list.map((r) => mapRideForViewer(r, req.user));
      return res.json({
        rides,
        // Backward-compatible single ride (most recently updated)
        ride: rides[0] || null,
      });
    }

    let ride = null;
    if (req.user.role === 'driver') {
      ride = await Ride.findOne({
        driverId: req.user.id,
        status: { $in: ['assigned', 'in_transit'] },
      })
        .sort({ updatedAt: -1 })
        .populate('parentId', 'name phone')
        .populate('driverId', 'name phone vehiclePlate');
    }
    const mapped = mapRideForViewer(ride, req.user);
    res.json({ ride: mapped, rides: mapped ? [mapped] : [] });
  } catch (err) {
    console.error('[rides/active]', err);
    res.status(500).json({ error: 'Failed to get active ride' });
  }
});

/**
 * Preview dynamic fare from pickup → dropoff (distance + local fuel).
 * GET /api/rides/quote?pickupLng=&pickupLat=&dropoffLng=&dropoffLat=&distanceKm=
 * or POST body with the same fields.
 */
async function handleQuote(req, res) {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const pickupCoords = parseCoords({
      lng: src.pickupLng ?? src.lng ?? src.pickup?.lng,
      lat: src.pickupLat ?? src.lat ?? src.pickup?.lat,
    }) || parseCoords(src.pickupCoords);
    const dropoffCoords = parseCoords({
      lng: src.dropoffLng ?? src.dropoff?.lng,
      lat: src.dropoffLat ?? src.dropoff?.lat,
    }) || parseCoords(src.dropoffCoords);

    const quote = calculateFare({
      pickupCoords,
      dropoffCoords,
      distanceKm: src.distanceKm,
    });

    res.json({
      ...quote,
      defaults: pricingDefaults(),
      pickupCoords,
      dropoffCoords,
    });
  } catch (err) {
    console.error('[rides/quote]', err);
    res.status(500).json({ error: 'Failed to quote fare' });
  }
}

router.get('/quote', requireAuth, requireRole('parent', 'admin'), handleQuote);
router.post('/quote', requireAuth, requireRole('parent', 'admin'), handleQuote);

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

    res.json({ ride: mapRideForViewer(ride, req.user) });
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
      parentLocation,
      date,
      time,
      tripType = 'pickup',
      distanceKm = null,
      instant = false,
      driverId = null,
      /** choose | nearest | pool — parent choice vs auto nearest vs open pool */
      assignMode: rawAssignMode = null,
    } = req.body || {};

    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const child = await Child.findOne({
      _id: childId,
      parentId: req.user.id,
    });
    if (!child) return res.status(400).json({ error: 'Invalid child' });

    // Resolve assignment mode
    let assignMode = String(rawAssignMode || '').toLowerCase();
    if (!['choose', 'nearest', 'pool'].includes(assignMode)) {
      if (driverId) assignMode = 'choose';
      else assignMode = 'nearest'; // default: auto nearest when no driver picked
    }

    let preferredDriverId = null;
    let nearestMeta = null;

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

    const fromSchool = String(tripType || '').toLowerCase() === 'pickup';
    const homeLabel =
      parent?.homeAddress || `Home · ${fromSchool ? 'drop-off' : 'pickup'} for ${child.name}`;
    const schoolLabel = child.schoolAddress || child.school || 'School';
    const homeCoordsParsed = parseCoords(parent?.homeCoords);
    const schoolCoordsParsed = parseCoords(child.schoolCoords);

    // Instant rides fill home ↔ school from saved pins when locations are omitted
    if (instant) {
      if (fromSchool) {
        ridePickup = ridePickup || schoolLabel;
        rideDropoff = rideDropoff || homeLabel;
        if (!fromCoords && schoolCoordsParsed) fromCoords = schoolCoordsParsed;
        if (!toCoords && homeCoordsParsed) toCoords = homeCoordsParsed;
      } else {
        ridePickup = ridePickup || homeLabel;
        rideDropoff = rideDropoff || schoolLabel;
        if (!fromCoords && homeCoordsParsed) fromCoords = homeCoordsParsed;
        if (!toCoords && schoolCoordsParsed) toCoords = schoolCoordsParsed;
      }
    }

    if (!ridePickup || !rideDropoff) {
      return res.status(400).json({
        error: 'childId, pickup, dropoff, date, and time are required',
      });
    }

    // Fill the missing end from the child's school pin or parent home
    if (!fromCoords) {
      fromCoords = fromSchool ? schoolCoordsParsed : homeCoordsParsed;
    }
    if (!toCoords) {
      toCoords = fromSchool ? homeCoordsParsed : schoolCoordsParsed;
    }

    // Lagos-area fallbacks so maps always have anchors
    if (!fromCoords) {
      fromCoords = fromSchool
        ? { lng: 3.4219, lat: 6.4281 }
        : { lng: 3.4734, lat: 6.4474 };
    }
    if (!toCoords) {
      toCoords = fromSchool
        ? { lng: 3.4734, lat: 6.4474 }
        : { lng: 3.4219, lat: 6.4281 };
    }

    if (assignMode === 'choose') {
      if (!driverId) {
        return res.status(400).json({
          error: 'Pick a driver, or choose automatic nearest assignment.',
        });
      }
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
    } else if (assignMode === 'nearest') {
      // Provisional nearest pick at booking (re-checked on payment for freshness)
      const free = await listAvailableDriversNear(fromCoords);
      const picked = pickNearestDriver(free, fromCoords);
      if (picked?.driver) {
        preferredDriverId = picked.driver._id;
        nearestMeta = {
          driverId: picked.driver._id.toString(),
          distanceKm: picked.distanceKm,
          name: picked.driver.name,
        };
      } else {
        // No free drivers with GPS — fall back to open pool after pay
        assignMode = 'pool';
        preferredDriverId = null;
      }
    } else {
      // pool — any driver after payment
      preferredDriverId = null;
    }

    // Parent shares live GPS with the driver at booking time
    const parentCoords = parseCoords(parentLocation);
    let parentLoc = null;
    if (parentCoords) {
      parentLoc = {
        lng: parentCoords.lng,
        lat: parentCoords.lat,
        accuracy:
          parentLocation?.accuracy != null &&
          Number.isFinite(Number(parentLocation.accuracy))
            ? Number(parentLocation.accuracy)
            : null,
        label: String(parentLocation?.label || '').trim().slice(0, 240),
        updatedAt: new Date(),
      };
      // Keep parent lastLocation in sync for fleet / support tools
      await User.findByIdAndUpdate(req.user.id, {
        lastLocation: {
          lng: parentCoords.lng,
          lat: parentCoords.lat,
          heading: 0,
          updatedAt: parentLoc.updatedAt,
        },
      });
    }

    // Server-authoritative dynamic fare (distance + local fuel cost)
    const fare = calculateFare({
      pickupCoords: fromCoords,
      dropoffCoords: toCoords,
      distanceKm,
    });

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const created = await Ride.create({
      parentId: req.user.id,
      childId: child._id,
      childName: child.name,
      driverId: preferredDriverId,
      assignMode,
      pickup: String(ridePickup).trim(),
      dropoff: String(rideDropoff).trim(),
      pickupCoords: fromCoords,
      dropoffCoords: toCoords,
      parentLocation: parentLoc || {
        lng: null,
        lat: null,
        accuracy: null,
        label: '',
        updatedAt: null,
      },
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
      fareCents: fare.fareCents,
      distanceKm: fare.distanceKm,
      fuelPricePerLiter: fare.fuelPricePerLiter,
      fareBreakdown: fare.breakdown,
      currency: 'ngn',
      handoverPin: pin,
      paymentStatus: 'unpaid',
    });

    const ride = await findRidePopulated({ _id: created._id });
    res.status(201).json({
      ride: mapRide(ride),
      fare,
      nearestDriver: nearestMeta,
    });
  } catch (err) {
    console.error('[rides POST]', err);
    res.status(500).json({ error: 'Failed to create ride' });
  }
});

/**
 * Driver (or admin) pushes GPS.
 * Location is only shared with the parent after pickup is confirmed
 * (status in_transit + locationSharing). Admin always receives live transit updates.
 */
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

    // Stop accepting GPS after dropoff / if not yet picked up
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({
        error: 'Location sharing has ended for this trip',
        locationSharing: false,
      });
    }
    if (ride.status !== 'in_transit' || !ride.locationSharing) {
      return res.status(400).json({
        error: 'Confirm pickup before sharing location with the parent',
        locationSharing: false,
        status: ride.status,
      });
    }

    const now = new Date();
    ride.driverLocation = {
      lng: coords.lng,
      lat: coords.lat,
      heading,
      updatedAt: now,
    };

    const trail = Array.isArray(ride.trail) ? [...ride.trail] : [];
    const last = trail[trail.length - 1];
    const movedEnough =
      !last ||
      Math.abs(last.lng - coords.lng) > 0.00002 ||
      Math.abs(last.lat - coords.lat) > 0.00002;
    if (movedEnough) {
      trail.push({ lng: coords.lng, lat: coords.lat, at: now });
      ride.trail =
        trail.length > TRAIL_MAX
          ? trail.slice(trail.length - TRAIL_MAX)
          : trail;

      // Throttle feed progress notes (~every ~300m of trail points, or every 8th point)
      if (trail.length === 1 || trail.length % 8 === 0) {
        pushTransitFeed(
          ride,
          'progress',
          `En route to drop-off · ${ride.dropoff}`,
          coords,
        );
      }
    }

    await ride.save();

    await User.findByIdAndUpdate(req.user.id, {
      lastLocation: {
        lng: coords.lng,
        lat: coords.lat,
        heading,
        updatedAt: now,
      },
    });

    const trailPayload = ride.trail.map((p) => ({
      lng: p.lng,
      lat: p.lat,
      at: p.at,
    }));

    const payload = {
      rideId: ride._id.toString(),
      lng: coords.lng,
      lat: coords.lat,
      heading,
      updatedAt: now,
      locationSharing: true,
      status: ride.status,
      trail: trailPayload,
      transitFeed: (ride.transitFeed || []).map((e) => ({
        type: e.type,
        message: e.message,
        at: e.at,
        lng: e.lng ?? null,
        lat: e.lat ?? null,
      })),
    };

    const io = req.app.get('io');
    if (io) {
      // Parent / assigned driver room — only while sharing
      io.to(`ride:${ride._id}`).emit('ride:location', payload);
      // Admin fleet map
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
    }

    res.json({
      driverLocation: {
        lng: coords.lng,
        lat: coords.lat,
        heading,
        updatedAt: now,
      },
      trail: trailPayload,
      locationSharing: true,
      transitFeed: payload.transitFeed,
    });
  } catch (err) {
    console.error('[rides location POST]', err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.get('/:id/location', requireAuth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select(
      'parentId driverId pickupCoords dropoffCoords driverLocation trail transitFeed pickup dropoff status locationSharing pickedUpAt deliveredAt',
    );
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const parentId = ride.parentId?.toString();
    const driverId = ride.driverId?.toString();
    const isParent = parentId === req.user.id;
    const isDriver = driverId === req.user.id;
    if (req.user.role !== 'admin' && !isParent && !isDriver) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Parents only see live GPS after driver confirms pickup
    const canSeeLive =
      req.user.role === 'admin' ||
      isDriver ||
      (isParent && ride.locationSharing && ride.status === 'in_transit');

    res.json({
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      status: ride.status,
      locationSharing: !!ride.locationSharing,
      pickedUpAt: ride.pickedUpAt || null,
      deliveredAt: ride.deliveredAt || null,
      pickupCoords:
        ride.pickupCoords?.lng != null
          ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
          : null,
      dropoffCoords:
        ride.dropoffCoords?.lng != null
          ? { lng: ride.dropoffCoords.lng, lat: ride.dropoffCoords.lat }
          : null,
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
    });
  } catch (err) {
    console.error('[rides location GET]', err);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

/** Statuses where the parent may cancel before a driver has accepted */
const PARENT_CANCELLABLE = ['pending_payment', 'open', 'requested'];

/**
 * Parent cancels a trip before any driver accepts.
 * Allowed only while status is pending_payment, open, or requested.
 */
router.post('/:id/cancel', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    if (ride.parentId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (ride.status === 'cancelled') {
      const updated = await findRidePopulated({ _id: ride._id });
      return res.json({ ride: mapRide(updated), alreadyCancelled: true });
    }

    if (!PARENT_CANCELLABLE.includes(ride.status)) {
      return res.status(400).json({
        error:
          ride.status === 'assigned' || ride.status === 'in_transit'
            ? 'A driver has already accepted this trip. Cancel is only available before accept.'
            : 'This trip can no longer be cancelled',
      });
    }

    const previousStatus = ride.status;
    const preferredDriverId = ride.driverId?.toString() || null;

    ride.status = 'cancelled';
    ride.locationSharing = false;
    pushTransitFeed(
      ride,
      'cancelled',
      previousStatus === 'pending_payment'
        ? 'Trip cancelled by parent before payment.'
        : 'Trip cancelled by parent before a driver accepted.',
    );
    await ride.save();

    const updated = await findRidePopulated({ _id: ride._id });
    const mapped = mapRide(updated);
    const io = req.app.get('io');
    if (io) {
      const statusPayload = {
        rideId: mapped.id,
        status: mapped.status,
        locationSharing: false,
        cancelledBy: 'parent',
        previousStatus,
        transitFeed: mapped.transitFeed,
        driverLocation: null,
        trail: [],
      };
      io.to(`ride:${mapped.id}`).emit('ride:status', statusPayload);
      // Notify preferred driver (if any) so their available list can refresh
      if (preferredDriverId) {
        io.to(`user:${preferredDriverId}`).emit('ride:cancelled', statusPayload);
      }
      io.to('drivers:available').emit('ride:cancelled', statusPayload);
    }

    res.json({ ride: mapped });
  } catch (err) {
    console.error('[rides cancel]', err);
    res.status(500).json({ error: 'Failed to cancel ride' });
  }
});

router.post('/:id/accept', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.paymentStatus !== 'paid') {
      return res.status(400).json({ error: 'Ride is not paid yet' });
    }
    if (ride.status === 'cancelled') {
      return res.status(400).json({ error: 'This ride was cancelled by the parent' });
    }

    const isOpenPool = ride.status === 'open' && !ride.driverId;
    const isPreferredRequest =
      ride.status === 'requested' &&
      ride.driverId?.toString() === req.user.id;

    if (!isOpenPool && !isPreferredRequest) {
      return res.status(400).json({ error: 'Ride is not available to accept' });
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

/** Preferred driver declines — ride returns to open pool for any driver */
router.post('/:id/reject', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    if (
      ride.status !== 'requested' ||
      ride.driverId?.toString() !== req.user.id
    ) {
      return res.status(400).json({
        error: 'Only preferred ride requests assigned to you can be declined',
      });
    }

    ride.driverId = null;
    ride.status = 'open';
    await ride.save();

    const updated = await findRidePopulated({ _id: ride._id });
    res.json({ ride: mapRide(updated) });
  } catch (err) {
    console.error('[rides reject]', err);
    res.status(500).json({ error: 'Failed to decline ride' });
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

    // Parents may only cancel before a driver accepts (use dedicated cancel route preferred)
    if (req.user.role === 'parent' && status === 'cancelled') {
      if (!PARENT_CANCELLABLE.includes(ride.status)) {
        return res.status(400).json({
          error:
            'You can only cancel a trip before a driver accepts. Once assigned, contact support if needed.',
        });
      }
    } else if (req.user.role === 'parent' && status !== 'cancelled') {
      return res.status(403).json({
        error: 'Parents can only cancel trips, not change other statuses',
      });
    }

    // Drivers may only advance assigned/in_transit rides they own
    if (req.user.role === 'driver' && status !== 'cancelled') {
      if (!isDriver || !['assigned', 'in_transit'].includes(ride.status)) {
        return res.status(400).json({
          error: 'Accept the ride request before starting the trip',
        });
      }
    }

    // Confirm pickup → begin location sharing with parent
    if (status === 'in_transit') {
      if (!['assigned', 'in_transit'].includes(ride.status)) {
        return res.status(400).json({
          error: 'Ride must be assigned before confirming pickup',
        });
      }
      if (ride.status !== 'in_transit') {
        ride.status = 'in_transit';
        ride.locationSharing = true;
        ride.pickedUpAt = new Date();
        // Seed trail at pickup so the blue path starts cleanly
        if (
          ride.pickupCoords?.lng != null &&
          (!ride.trail || ride.trail.length === 0)
        ) {
          ride.trail = [
            {
              lng: ride.pickupCoords.lng,
              lat: ride.pickupCoords.lat,
              at: ride.pickedUpAt,
            },
          ];
          ride.driverLocation = {
            lng: ride.pickupCoords.lng,
            lat: ride.pickupCoords.lat,
            heading: 0,
            updatedAt: ride.pickedUpAt,
          };
        }
        pushTransitFeed(
          ride,
          'pickup_confirmed',
          `Pickup confirmed for ${ride.childName}. Live location sharing started.`,
          ride.pickupCoords?.lng != null
            ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
            : null,
        );
      }
    } else if (status === 'completed') {
      // Dropoff / delivered → stop sharing immediately
      ride.status = 'completed';
      ride.locationSharing = false;
      ride.deliveredAt = new Date();
      pushTransitFeed(
        ride,
        'delivered',
        `Drop-off complete · ${ride.childName} delivered to ${ride.dropoff}. Location sharing stopped.`,
        ride.driverLocation?.lng != null
          ? { lng: ride.driverLocation.lng, lat: ride.driverLocation.lat }
          : ride.dropoffCoords?.lng != null
            ? { lng: ride.dropoffCoords.lng, lat: ride.dropoffCoords.lat }
            : null,
      );
    } else if (status === 'cancelled') {
      ride.status = 'cancelled';
      ride.locationSharing = false;
      pushTransitFeed(ride, 'cancelled', 'Trip cancelled. Location sharing stopped.');
    } else {
      ride.status = status;
      if (status === 'assigned') {
        ride.locationSharing = false;
      }
    }

    await ride.save();

    const updated = await findRidePopulated({ _id: ride._id });
    const mapped = mapRide(updated);
    const io = req.app.get('io');
    if (io) {
      const statusPayload = {
        rideId: mapped.id,
        status: mapped.status,
        locationSharing: mapped.locationSharing,
        pickedUpAt: mapped.pickedUpAt,
        deliveredAt: mapped.deliveredAt,
        transitFeed: mapped.transitFeed,
        driverLocation: mapped.locationSharing ? mapped.driverLocation : null,
        trail: mapped.locationSharing ? mapped.trail : [],
      };
      io.to(`ride:${mapped.id}`).emit('ride:status', statusPayload);

      if (status === 'in_transit' && mapped.locationSharing) {
        io.to('admin:transit').emit('transit:started', mapTransitRide(updated));
      }
      if (status === 'completed' || status === 'cancelled') {
        io.to('admin:transit').emit('transit:ended', {
          rideId: mapped.id,
          status: mapped.status,
          locationSharing: false,
          transitFeed: mapped.transitFeed,
          deliveredAt: mapped.deliveredAt,
        });
      }
    }

    res.json({ ride: mapped });
  } catch (err) {
    console.error('[rides status]', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
