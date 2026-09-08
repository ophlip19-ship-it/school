/** Match a ride to a child profile (id first, name fallback for older payloads). */
export function matchRideToChild(ride, child) {
  if (!ride || !child) return false;
  if (ride.childId && String(ride.childId) === String(child.id)) return true;
  if (ride.childName && child.name && ride.childName === child.name) return true;
  return false;
}

export function rideForChild(rides, child) {
  if (!child) return null;
  return (rides || []).find((r) => matchRideToChild(r, child)) || null;
}

export function childForRide(children, ride) {
  if (!ride) return null;
  return (children || []).find((c) => matchRideToChild(ride, c)) || null;
}

export function tripStatusLabel(status) {
  switch (status) {
    case 'requested':
      return 'Waiting for driver';
    case 'open':
      return 'Finding driver';
    case 'pending_payment':
      return 'Payment needed';
    case 'assigned':
      return 'Driver on the way';
    case 'in_transit':
      return 'In transit';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'scheduled':
      return 'Scheduled';
    default:
      return String(status || 'active').replace(/_/g, ' ');
  }
}

/** Live / in-progress trip (blocks another instant booking for that child). */
export function isLiveTrip(ride) {
  if (!ride) return false;
  if (['open', 'requested', 'assigned', 'in_transit'].includes(ride.status)) {
    return true;
  }
  return ride.status === 'pending_payment' && ride.instant === true;
}

export function isScheduledTrip(ride) {
  if (!ride) return false;
  return (
    ride.status === 'scheduled' ||
    (ride.status === 'pending_payment' && ride.instant !== true)
  );
}

export function liveRideForChild(rides, child) {
  if (!child) return null;
  return (rides || []).find((r) => isLiveTrip(r) && matchRideToChild(r, child)) || null;
}

export function scheduledRidesForChild(rides, child) {
  if (!child) return [];
  return (rides || []).filter((r) => isScheduledTrip(r) && matchRideToChild(r, child));
}

export function isTrackableStatus(status) {
  return status === 'assigned' || status === 'in_transit';
}

/** Parent may see live GPS only after pickup confirmation. */
export function canSeeLiveLocation(ride) {
  return !!(ride?.locationSharing && ride?.status === 'in_transit');
}

export function tripPosition(ride) {
  if (canSeeLiveLocation(ride) && ride?.driverLocation?.lng != null) {
    return {
      lng: ride.driverLocation.lng,
      lat: ride.driverLocation.lat,
      heading: ride.driverLocation.heading || 0,
      live: true,
    };
  }
  if (ride?.pickupCoords?.lng != null && ride?.pickupCoords?.lat != null) {
    return {
      lng: ride.pickupCoords.lng,
      lat: ride.pickupCoords.lat,
      heading: 0,
      live: false,
    };
  }
  if (ride?.dropoffCoords?.lng != null && ride?.dropoffCoords?.lat != null) {
    return {
      lng: ride.dropoffCoords.lng,
      lat: ride.dropoffCoords.lat,
      heading: 0,
      live: false,
    };
  }
  return null;
}

export const TRIP_COLORS = [
  '#059669',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#4f46e5',
];

export function colorForKey(key) {
  const s = String(key || '');
  if (!s) return TRIP_COLORS[0];
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return TRIP_COLORS[hash % TRIP_COLORS.length];
}
