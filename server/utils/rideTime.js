/** Parse rideDate (YYYY-MM-DD) + rideTime (HH:MM) as a local Date. */
export function parseRideDateTime(rideDate, rideTime) {
  const dateStr = String(rideDate || '').trim();
  const timeStr = String(rideTime || '00:00').trim();
  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const y = dateParts[0];
  const m = dateParts[1];
  const d = dateParts[2];
  const hh = timeParts[0] || 0;
  const mm = timeParts[1] || 0;
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTimeKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Statuses that mean a child is on a live (in-progress) trip. */
export const LIVE_TRIP_STATUSES = [
  'open',
  'requested',
  'assigned',
  'in_transit',
];

export const SCHEDULED_STATUSES = ['scheduled'];

/** Show on the parent live map / driver active slot. */
export const LIVE_SOON_MS = 2 * 60 * 60 * 1000;

/**
 * True when the ride is happening now (or within LIVE_SOON_MS).
 * Future scheduled requests stay off the live map until they are due.
 */
export function isLiveNow(ride, now = Date.now()) {
  if (!ride) return false;
  const status = ride.status;
  if (['assigned', 'in_transit'].includes(status)) return true;
  if (status === 'pending_payment' && ride.instant) return true;
  if (!['open', 'requested'].includes(status)) return false;
  if (ride.instant) return true;
  const when = parseRideDateTime(
    ride.date || ride.rideDate,
    ride.time || ride.rideTime,
  );
  if (!when) return true;
  return when.getTime() - now <= LIVE_SOON_MS;
}
