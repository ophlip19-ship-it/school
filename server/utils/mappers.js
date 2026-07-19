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
