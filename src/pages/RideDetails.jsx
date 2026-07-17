import { Link, useLocation } from 'react-router-dom';
import { formatMoney } from '../lib/api';

export default function RideDetails() {
  const { state: ride } = useLocation();

  if (!ride) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-slate-600">No ride selected.</p>
        <Link to="/history" className="mt-4 inline-block text-emerald-600">
          ← History
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <Link to="/history" className="text-sm font-medium text-emerald-600">
        ← History
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Ride details</h1>

      <div className="mt-8 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {[
          ['Child', ride.childName],
          ['Type', ride.tripType],
          ['Date', `${ride.date} · ${ride.time}`],
          ['Pickup', ride.pickup],
          ['Drop-off', ride.dropoff],
          ['Driver', ride.driverName || 'Unassigned'],
          ['Vehicle', ride.vehiclePlate || '—'],
          ['Status', ride.status],
          ['Payment', ride.paymentStatus],
          ['Fare', formatMoney(ride.fareCents)],
          ['Handover PIN', ride.handoverPin],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0"
          >
            <span className="text-sm text-slate-500">{label}</span>
            <span className="max-w-[60%] text-right font-medium capitalize text-slate-900">
              {String(value ?? '—').replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3">
        {ride.paymentStatus === 'paid' && (
          <>
            <Link
              to={`/live-tracking?rideId=${ride.id}`}
              className="block w-full rounded-2xl bg-emerald-600 py-4 text-center font-semibold text-white"
            >
              Track live
            </Link>
            <Link
              to={`/chat?rideId=${ride.id}`}
              className="block w-full rounded-2xl border border-slate-200 bg-white py-4 text-center font-semibold text-slate-800"
            >
              Open chat
            </Link>
          </>
        )}
        {ride.paymentStatus !== 'paid' && (
          <Link
            to={`/payment?rideId=${ride.id}`}
            className="block w-full rounded-2xl bg-emerald-600 py-4 text-center font-semibold text-white"
          >
            Complete payment
          </Link>
        )}
      </div>
    </div>
  );
}
