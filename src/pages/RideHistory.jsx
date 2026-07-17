import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesApi, formatMoney } from '../lib/api';

export default function RideHistory() {
  const { user } = useAuth();
  const [rides, setRides] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    ridesApi
      .list()
      .then(({ rides: list }) => setRides(list))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <Link to="/dashboard" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Ride history</h1>
      <p className="mt-2 text-slate-600">Trips for {user?.childName || 'your children'}</p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 space-y-3">
        {rides.map((ride) => (
          <Link
            key={ride.id}
            to="/ride-details"
            state={ride}
            className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  {ride.tripType === 'dropoff' ? 'School dropoff' : 'School pickup'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {ride.date} · {ride.childName}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Driver: {ride.driverName || 'Unassigned'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-700">{formatMoney(ride.fareCents)}</p>
                <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                  {ride.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {rides.length === 0 && !error && (
          <p className="text-center text-slate-500">No rides yet. Book your first trip!</p>
        )}
      </div>
    </div>
  );
}
