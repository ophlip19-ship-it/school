import Ride from '../models/Ride.js';
import User from '../models/User.js';
import { haversineKm, pickNearestDriver } from './pricing.js';
import { mapRide, pushTransitFeed } from './mappers.js';

/**
 * Active (not suspended) drivers with no assigned/in-transit ride.
 * Optionally exclude driver ids and rank by distance to a target point.
 */
export async function listFreeDriversNear(
  targetCoords = null,
  { excludeDriverIds = [] } = {},
) {
  const exclude = new Set(
    (excludeDriverIds || [])
      .filter(Boolean)
      .map((id) => id.toString()),
  );

  const drivers = await User.find({
    role: 'driver',
    suspended: { $ne: true },
  }).lean();

  const free = [];
  for (const d of drivers) {
    const id = d._id.toString();
    if (exclude.has(id)) continue;

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

/**
 * True when the driver currently has an assigned or in-transit trip.
 */
export async function isDriverOnTrip(driverId) {
  if (!driverId) return false;
  const activeCount = await Ride.countDocuments({
    driverId,
    status: { $in: ['assigned', 'in_transit'] },
  });
  return activeCount > 0;
}

/**
 * Pick the nearest free driver to pickup, excluding busy/excluded drivers.
 * Returns { driver, distanceKm } or null.
 */
export async function assignNearestFreeDriver(
  pickupCoords,
  { excludeDriverIds = [] } = {},
) {
  const free = await listFreeDriversNear(pickupCoords, { excludeDriverIds });
  if (!free.length) return null;
  return pickNearestDriver(free, pickupCoords);
}

function emitRideReassigned(io, rideDoc, extras = {}) {
  if (!io || !rideDoc) return;
  const mapped = mapRide(rideDoc);
  const payload = {
    rideId: mapped.id,
    status: mapped.status,
    driverId: mapped.driverId,
    driverName: mapped.driverName || null,
    assignMode: mapped.assignMode,
    reason: extras.reason || 'driver_unavailable',
    previousDriverId: extras.previousDriverId || null,
    transitFeed: mapped.transitFeed,
  };

  io.to(`ride:${mapped.id}`).emit('ride:reassigned', payload);
  io.to(`ride:${mapped.id}`).emit('ride:status', {
    rideId: mapped.id,
    status: mapped.status,
    driverId: mapped.driverId,
    locationSharing: mapped.locationSharing,
    transitFeed: mapped.transitFeed,
  });

  if (mapped.parentId) {
    io.to(`user:${mapped.parentId}`).emit('ride:reassigned', payload);
  }
  if (extras.previousDriverId) {
    io.to(`user:${extras.previousDriverId}`).emit('ride:reassigned', payload);
  }
  if (mapped.driverId) {
    io.to(`user:${mapped.driverId}`).emit('ride:request', {
      rideId: mapped.id,
      status: mapped.status,
    });
  }
  io.to('drivers:available').emit('ride:reassigned', payload);
}

/**
 * Reassign a single requested ride to the nearest free driver.
 * Falls open to the pool when nobody free is available.
 *
 * @returns {{ ride, reassigned: boolean, toPool: boolean } | null}
 */
export async function reassignRideToNearest(ride, {
  io = null,
  excludeDriverIds = [],
  reason = 'driver_unavailable',
} = {}) {
  if (!ride || ride.status !== 'requested') return null;

  const previousDriverId = ride.driverId?.toString?.() || ride.driverId || null;
  const exclude = [...excludeDriverIds];
  if (previousDriverId) exclude.push(previousDriverId);

  const picked = await assignNearestFreeDriver(ride.pickupCoords, {
    excludeDriverIds: exclude,
  });

  if (picked?.driver) {
    ride.driverId = picked.driver._id;
    ride.status = 'requested';
    // Auto-nearest reassignment — keep or switch mode to nearest
    if (ride.assignMode !== 'choose') {
      ride.assignMode = 'nearest';
    }
    const distLabel =
      picked.distanceKm != null ? ` (~${picked.distanceKm} km)` : '';
    pushTransitFeed(
      ride,
      'reassigned',
      `Driver became unavailable. Reassigned to nearest free driver${distLabel}: ${picked.driver.name || 'driver'}.`,
      ride.pickupCoords?.lng != null
        ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
        : null,
    );
    await ride.save();

    const populated = await Ride.findById(ride._id)
      .populate('parentId', 'name phone')
      .populate('driverId', 'name phone vehiclePlate');

    emitRideReassigned(io, populated, { previousDriverId, reason });
    return { ride: populated, reassigned: true, toPool: false };
  }

  // Nobody free → open pool so any driver can grab it
  ride.driverId = null;
  ride.status = 'open';
  ride.assignMode = 'pool';
  pushTransitFeed(
    ride,
    'reassigned',
    'Driver became unavailable. No free drivers nearby — opened to all available drivers.',
    ride.pickupCoords?.lng != null
      ? { lng: ride.pickupCoords.lng, lat: ride.pickupCoords.lat }
      : null,
  );
  await ride.save();

  const populated = await Ride.findById(ride._id)
    .populate('parentId', 'name phone')
    .populate('driverId', 'name phone vehiclePlate');

  emitRideReassigned(io, populated, { previousDriverId, reason });
  return { ride: populated, reassigned: true, toPool: true };
}

/**
 * When a driver becomes unavailable (accepts / starts a trip), reassign their
 * other pending preferred requests to the nearest free driver.
 *
 * - nearest / pool-originated requests → auto reassign
 * - choose (parent-picked) requests → kept so the preferred driver can still
 *   accept after finishing; only reassigned if `includeChoose` is true
 *
 * @returns {Array} list of reassignment results
 */
export async function reassignPendingRequestsForBusyDriver(
  busyDriverId,
  {
    io = null,
    excludeRideId = null,
    includeChoose = false,
  } = {},
) {
  if (!busyDriverId) return [];

  const filter = {
    driverId: busyDriverId,
    status: 'requested',
    paymentStatus: 'paid',
  };
  if (excludeRideId) {
    filter._id = { $ne: excludeRideId };
  }

  const pending = await Ride.find(filter);
  if (!pending.length) return [];

  const results = [];
  // Drivers already given a reassigned request in this batch stay free until
  // they accept — but avoid stacking every request on the same nearest person
  // by excluding them once they receive a request in this pass.
  const justAssigned = [];

  for (const ride of pending) {
    const mode = String(ride.assignMode || '').toLowerCase();
    if (mode === 'choose' && !includeChoose) {
      continue;
    }

    const result = await reassignRideToNearest(ride, {
      io,
      excludeDriverIds: [busyDriverId, ...justAssigned],
      reason: 'driver_on_trip',
    });
    if (result?.reassigned && result.ride?.driverId) {
      justAssigned.push(result.ride.driverId.toString());
    }
    if (result) results.push(result);
  }

  return results;
}
