import Ride from '../models/Ride.js';
import User from '../models/User.js';
import { parseRideDateTime } from './rideTime.js';
import { assignNearestFreeDriver } from './assignment.js';
import { mapRide, pushTransitFeed } from './mappers.js';

const REMIND_MS = 30 * 60 * 1000;
const ACTIVATE_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 1000;

async function resolveDispatch(ride) {
  const mode = String(ride.assignMode || '').toLowerCase();

  if (mode === 'pool') {
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  if (mode === 'nearest') {
    const picked = await assignNearestFreeDriver(ride.pickupCoords);
    const driver = picked?.driver || null;
    if (driver) {
      return {
        driverId: driver._id,
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

function emitToParentAndDrivers(io, rideDoc, event, extra = {}) {
  if (!io || !rideDoc) return;
  const mapped = mapRide(rideDoc);
  const payload = {
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
    ...extra,
  };

  if (mapped.parentId) {
    io.to(`user:${mapped.parentId}`).emit(event, payload);
  }
  io.to(`ride:${mapped.id}`).emit(event, payload);
  if (mapped.driverId) {
    io.to(`user:${mapped.driverId}`).emit(event, payload);
  }
  if (event === 'ride:activated') {
    io.to('drivers:available').emit('ride:available', payload);
  }
}

async function sendReminders(io) {
  const now = Date.now();
  const rides = await Ride.find({
    status: 'scheduled',
    paymentStatus: 'paid',
    remindedAt: null,
  }).limit(80);

  for (const ride of rides) {
    const when = parseRideDateTime(ride.rideDate, ride.rideTime);
    if (!when) continue;
    const msUntil = when.getTime() - now;
    if (msUntil > REMIND_MS || msUntil < -5 * 60 * 1000) continue;

    ride.remindedAt = new Date();
    pushTransitFeed(
      ride,
      'reminder',
      `Reminder: ${ride.childName}'s ride is at ${ride.rideTime}.`,
    );
    await ride.save();

    const populated = await Ride.findById(ride._id)
      .populate('parentId', 'name phone')
      .populate('driverId', 'name phone vehiclePlate');
    emitToParentAndDrivers(io, populated, 'ride:reminder', {
      minutesUntil: Math.max(0, Math.round(msUntil / 60000)),
    });
  }
}

async function activateDueRides(io) {
  const now = Date.now();
  const rides = await Ride.find({
    status: 'scheduled',
    paymentStatus: 'paid',
  }).limit(80);

  for (const ride of rides) {
    const when = parseRideDateTime(ride.rideDate, ride.rideTime);
    if (!when) continue;
    const msUntil = when.getTime() - now;
    if (msUntil > ACTIVATE_MS) continue;

    const dispatch = await resolveDispatch(ride);
    ride.status = dispatch.status;
    ride.driverId = dispatch.driverId;
    ride.assignMode = dispatch.assignMode;
    pushTransitFeed(
      ride,
      'activated',
      dispatch.status === 'requested'
        ? `Scheduled ride is live — waiting for the driver to accept.`
        : `Scheduled ride is live — looking for a driver.`,
    );
    await ride.save();

    const populated = await Ride.findById(ride._id)
      .populate('parentId', 'name phone')
      .populate('driverId', 'name phone vehiclePlate');
    emitToParentAndDrivers(io, populated, 'ride:activated');
    emitToParentAndDrivers(io, populated, 'ride:status', {
      locationSharing: false,
    });
  }
}

export function startScheduleJobs(io) {
  const tick = async () => {
    try {
      await sendReminders(io);
      await activateDueRides(io);
    } catch (err) {
      console.error('[scheduleJobs]', err.message || err);
    }
  };

  tick();
  const id = setInterval(tick, TICK_MS);
  if (typeof id.unref === 'function') id.unref();
  return id;
}
