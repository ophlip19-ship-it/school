import User from '../models/User.js';
import { mapRide, pushTransitFeed } from './mappers.js';
import { parseRideDateTime } from './rideTime.js';
import { assignNearestFreeDriver } from './assignment.js';
import { pickNearestDriver } from './pricing.js';
import { sendPushToUser } from './push.js';

export const LIVE_WINDOW_MS = 15 * 60 * 1000;

export function isRideDueSoon(ride, windowMs = LIVE_WINDOW_MS) {
  if (ride?.instant) return true;
  const when = parseRideDateTime(
    ride?.rideDate || ride?.date,
    ride?.rideTime || ride?.time,
  );
  if (!when) return true;
  return when.getTime() - Date.now() <= windowMs;
}

/**
 * After payment: send a driver request immediately (scheduled and instant).
 *  - choose  → keep preferred driver, status requested
 *  - nearest → pick nearest free driver, status requested
 *  - pool    → clear driver, status open
 */
export async function resolvePostPaymentAssignment(ride) {
  const mode = String(ride.assignMode || '').toLowerCase();
  const pickup = ride.pickupCoords;

  if (mode === 'pool') {
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  if (mode === 'nearest') {
    const picked = await assignNearestFreeDriver(pickup);
    if (picked?.driver) {
      return {
        driverId: picked.driver._id,
        status: 'requested',
        assignMode: 'nearest',
      };
    }
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  if (ride.driverId) {
    const driver = await User.findOne({
      _id: ride.driverId,
      role: 'driver',
      suspended: { $ne: true },
    }).select('_id');
    if (driver) {
      return {
        driverId: driver._id,
        status: 'requested',
        assignMode: 'choose',
      };
    }
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  return { driverId: null, status: 'open', assignMode: mode || 'pool' };
}

export function dispatchPayload(rideDoc, extra = {}) {
  const mapped = mapRide(rideDoc);
  return {
    rideId: mapped.id,
    status: mapped.status,
    childName: mapped.childName,
    pickup: mapped.pickup,
    dropoff: mapped.dropoff,
    date: mapped.date,
    time: mapped.time,
    tripType: mapped.tripType,
    driverId: mapped.driverId,
    driverName: mapped.driverName || null,
    parentId: mapped.parentId,
    instant: mapped.instant,
    assignMode: mapped.assignMode,
    ...extra,
  };
}

export function emitRideDispatch(io, rideDoc, extra = {}) {
  if (!io || !rideDoc) return;
  const payload = dispatchPayload(rideDoc, extra);

  if (payload.parentId) {
    io.to(`user:${payload.parentId}`).emit('ride:status', payload);
  }
  io.to(`ride:${payload.rideId}`).emit('ride:status', payload);

  if (payload.status === 'requested' && payload.driverId) {
    io.to(`user:${payload.driverId}`).emit('ride:request', payload);
  }
  if (payload.status === 'open') {
    io.to('drivers:available').emit('ride:available', payload);
  }
  if (payload.status === 'assigned' || payload.status === 'scheduled') {
    if (payload.driverId) {
      io.to(`user:${payload.driverId}`).emit('ride:accepted', payload);
    }
    if (payload.parentId) {
      io.to(`user:${payload.parentId}`).emit('ride:accepted', payload);
    }
  }
}

export async function notifyDriverRequest(rideDoc) {
  const mapped = mapRide(rideDoc);
  if (!mapped?.driverId) return;
  const when = mapped.time
    ? `${mapped.date || ''} · ${mapped.time}`
    : 'the scheduled time';
  await sendPushToUser(mapped.driverId, {
    title: `Ride request · ${mapped.childName || 'Child'}`,
    body: `${mapped.pickup || 'Pickup'} → ${mapped.dropoff || 'drop-off'} · ${when}`,
    tag: `request-${mapped.id}`,
    url: '/driver/rides',
    rideId: mapped.id,
    requireInteraction: true,
  });
}

export function paidDispatchFeedMessage(ride, next) {
  const when = ride.rideTime || ride.time || 'the scheduled time';
  if (next.status === 'requested') {
    return ride.instant
      ? 'Paid — ride request sent to the driver now.'
      : `Paid — ride request sent to the driver now for ${when}.`;
  }
  return ride.instant
    ? 'Paid — looking for a driver.'
    : `Paid — opened to available drivers for ${when}.`;
}

/** Re-export so callers that ranked by GPS in payments can still use pickNearestDriver. */
export { pickNearestDriver };
