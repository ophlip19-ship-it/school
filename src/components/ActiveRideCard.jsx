import { Link } from 'react-router-dom';
import { MapPin, MessageSquare } from 'lucide-react';
import { isTrackableStatus, tripStatusLabel } from '../lib/childTrips';

const canParentCancel = (status) =>
  ['pending_payment', 'open', 'requested'].includes(status);

function rideTone(status) {
  if (status === 'requested') {
    return 'from-amber-500 to-orange-500 shadow-amber-500/20';
  }
  if (status === 'open' || status === 'pending_payment') {
    return 'from-blue-600 to-indigo-500 shadow-blue-600/20';
  }
  return 'from-emerald-600 to-teal-500 shadow-emerald-600/20';
}

function rideSummary(ride) {
  if (ride.status === 'requested') {
    return ride.driverName
      ? `Waiting · ${ride.driverName}`
      : 'Waiting for driver';
  }
  if (ride.status === 'open') return 'Finding a driver';
  if (ride.status === 'pending_payment') return 'Payment needed';
  return ride.driverName || 'Waiting for driver';
}

function ChildAvatar({ child }) {
  if (child?.photoUrl) {
    return (
      <img
        src={child.photoUrl}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 ring-2 ring-white">
      {(child?.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export default function ActiveRideCard({
  ride,
  child,
  onCancel,
  cancelling = false,
  onSelect,
}) {
  const showCancel = canParentCancel(ride.status);
  const trackable = isTrackableStatus(ride.status);
  const showPin =
    ride.paymentStatus === 'paid' &&
    ['assigned', 'in_transit'].includes(ride.status) &&
    ride.handoverPin;

  return (
    <article
      className={`flex min-h-0 flex-col rounded-2xl bg-gradient-to-br p-4 text-white shadow-md ${rideTone(
        ride.status,
      )}`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(ride)}
        className="flex min-w-0 items-start gap-2.5 text-left"
      >
        <ChildAvatar child={child || { name: ride.childName }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-sm font-bold leading-tight sm:text-base">
              {ride.childName}
            </h2>
            <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {tripStatusLabel(ride.status)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-white/85">
            {rideSummary(ride)}
            {ride.time ? ` · ${ride.time}` : ''}
          </p>
        </div>
      </button>

      {ride.pickup ? (
        <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-white/80">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{ride.pickup}</span>
        </p>
      ) : null}

      {showPin ? (
        <p className="mt-2 inline-flex w-fit items-center rounded-md bg-white/15 px-2 py-1 font-mono text-xs font-semibold tracking-wide">
          PIN {ride.handoverPin}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {trackable && (
          <Link
            to={`/live-tracking?rideId=${ride.id}`}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-700"
          >
            Track
          </Link>
        )}
        {ride.driverId && trackable && (
          <Link
            to={`/chat?rideId=${ride.id}`}
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold"
          >
            <MessageSquare size={12} /> Chat
          </Link>
        )}
        {ride.paymentStatus !== 'paid' && ride.status !== 'cancelled' && (
          <Link
            to={`/payment?rideId=${ride.id}`}
            className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-amber-950"
          >
            Pay
          </Link>
        )}
        {showCancel && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel?.(ride)}
            className="rounded-lg border border-white/35 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
    </article>
  );
}
