export function mapRide(ride, extras = {}) {
  if (!ride) return null;
  const r = ride.toObject ? ride.toObject() : ride;
  const parent = extras.parent || ride.parentId;
  const driver = extras.driver || ride.driverId;

  const parentObj =
    parent && typeof parent === 'object' && parent.name !== undefined
      ? parent
      : null;
  const driverObj =
    driver && typeof driver === 'object' && driver.name !== undefined
      ? driver
      : null;

  return {
    id: (r._id || r.id).toString(),
    parentId: (r.parentId?._id || r.parentId || '').toString() || null,
    driverId: r.driverId
      ? (r.driverId._id || r.driverId).toString()
      : null,
    childId: (r.childId?._id || r.childId || '').toString(),
    childName: r.childName,
    pickup: r.pickup,
    dropoff: r.dropoff,
    pickupCoords:
      r.pickupCoords?.lng != null && r.pickupCoords?.lat != null
        ? { lng: r.pickupCoords.lng, lat: r.pickupCoords.lat }
        : null,
    dropoffCoords:
      r.dropoffCoords?.lng != null && r.dropoffCoords?.lat != null
        ? { lng: r.dropoffCoords.lng, lat: r.dropoffCoords.lat }
        : null,
    locationSharing: !!r.locationSharing,
    pickedUpAt: r.pickedUpAt || null,
    deliveredAt: r.deliveredAt || null,
    driverLocation:
      r.driverLocation?.lng != null && r.driverLocation?.lat != null
        ? {
            lng: r.driverLocation.lng,
            lat: r.driverLocation.lat,
            heading: r.driverLocation.heading || 0,
            updatedAt: r.driverLocation.updatedAt,
          }
        : null,
    trail: Array.isArray(r.trail)
      ? r.trail
          .filter((p) => p?.lng != null && p?.lat != null)
          .map((p) => ({
            lng: p.lng,
            lat: p.lat,
            at: p.at,
          }))
      : [],
    transitFeed: Array.isArray(r.transitFeed)
      ? r.transitFeed.map((e) => ({
          type: e.type,
          message: e.message,
          at: e.at,
          lng: e.lng ?? null,
          lat: e.lat ?? null,
        }))
      : [],
    date: r.rideDate,
    time: r.rideTime,
    tripType: r.tripType,
    status: r.status,
    fareCents: r.fareCents,
    currency: r.currency,
    handoverPin: r.handoverPin,
    paymentStatus: r.paymentStatus,
    stripePaymentIntentId: r.stripePaymentIntentId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    parentName: parentObj?.name,
    driverName: driverObj?.name,
    driverPhone: driverObj?.phone,
    vehiclePlate: driverObj?.vehiclePlate,
    parentPhone: parentObj?.phone,
  };
}

const FEED_MAX = 80;

/** Append a transit feed event (mutates ride doc in memory; caller saves). */
export function pushTransitFeed(ride, type, message, coords = null) {
  const feed = Array.isArray(ride.transitFeed) ? [...ride.transitFeed] : [];
  const entry = {
    type,
    message,
    at: new Date(),
    lng: coords?.lng ?? null,
    lat: coords?.lat ?? null,
  };
  feed.push(entry);
  ride.transitFeed = feed.length > FEED_MAX ? feed.slice(feed.length - FEED_MAX) : feed;
  return entry;
}

/**
 * Redact live GPS for parents until driver confirms pickup (locationSharing).
 * Drivers and admins always see location when present.
 */
export function mapRideForViewer(ride, viewer) {
  const mapped = mapRide(ride);
  if (!mapped || !viewer) return mapped;

  const isAdmin = viewer.role === 'admin';
  const isDriver =
    viewer.role === 'driver' &&
    mapped.driverId &&
    String(mapped.driverId) === String(viewer.id);
  const isParent =
    viewer.role === 'parent' &&
    mapped.parentId &&
    String(mapped.parentId) === String(viewer.id);

  if (isAdmin || isDriver) return mapped;

  if (isParent) {
    const canSeeLive =
      mapped.locationSharing && mapped.status === 'in_transit';
    return {
      ...mapped,
      driverLocation: canSeeLive ? mapped.driverLocation : null,
      trail: canSeeLive ? mapped.trail : [],
    };
  }

  // Other roles / unexpected viewers — hide live GPS
  return {
    ...mapped,
    driverLocation: null,
    trail: [],
  };
}

/** Map a ride for admin transit overview (includes live location when sharing). */
export function mapTransitRide(ride) {
  const mapped = mapRide(ride);
  if (!mapped) return null;
  return {
    id: mapped.id,
    status: mapped.status,
    locationSharing: mapped.locationSharing,
    childName: mapped.childName,
    pickup: mapped.pickup,
    dropoff: mapped.dropoff,
    pickupCoords: mapped.pickupCoords,
    dropoffCoords: mapped.dropoffCoords,
    driverLocation: mapped.locationSharing ? mapped.driverLocation : null,
    trail: mapped.locationSharing ? mapped.trail : [],
    transitFeed: mapped.transitFeed,
    pickedUpAt: mapped.pickedUpAt,
    deliveredAt: mapped.deliveredAt,
    driverId: mapped.driverId,
    driverName: mapped.driverName,
    vehiclePlate: mapped.vehiclePlate,
    parentName: mapped.parentName,
    updatedAt: mapped.updatedAt,
  };
}

export function mapMessage(message, sender) {
  const m = message.toObject ? message.toObject() : message;
  const s =
    sender ||
    (message.senderId && typeof message.senderId === 'object'
      ? message.senderId
      : null);

  return {
    id: (m._id || m.id).toString(),
    rideId: (m.rideId?._id || m.rideId || '').toString(),
    senderId: (m.senderId?._id || m.senderId || '').toString(),
    senderName: s?.name || 'User',
    senderRole: s?.role || 'parent',
    body: m.body,
    createdAt: m.createdAt,
  };
}
