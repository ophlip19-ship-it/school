import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Clock, Navigation } from 'lucide-react';
import { ridesApi, formatMoney } from '../lib/api';

export default function DriverAvailableRides() {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [error, setError] = useState('');

  const load = () =>
    ridesApi
      .available()
      .then(({ rides: list }) => setRides(list))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const accept = async (id) => {
    try {
      await ridesApi.accept(id);
      navigate('/driver/active');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <Link to="/driver" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Available rides</h1>
      <p className="mt-2 text-slate-600">{rides.length} open paid requests</p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 space-y-4">
        {rides.map((ride) => (
          <div key={ride.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{ride.childName}</h3>
              <span className="font-bold text-emerald-600">{formatMoney(ride.fareCents)}</span>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <MapPin size={14} className="text-blue-600" /> {ride.pickup}
              </p>
              <p className="flex items-center gap-2">
                <Navigation size={14} className="text-emerald-600" /> {ride.dropoff}
              </p>
              <p className="flex items-center gap-2">
                <Clock size={14} /> {ride.date} · {ride.time}
              </p>
            </div>
            <button
              type="button"
              onClick={() => accept(ride.id)}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
            >
              Accept ride
            </button>
          </div>
        ))}
        {rides.length === 0 && !error && (
          <p className="text-center text-slate-500">No open rides. Check back soon.</p>
        )}
      </div>
    </div>
  );
}
