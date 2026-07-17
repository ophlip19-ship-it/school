import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, AlertCircle, Navigation, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, formatMoney } from '../lib/api';

export default function DriverDashboard() {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);
  const [activeRide, setActiveRide] = useState(null);
  const [available, setAvailable] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [{ ride }, { rides }] = await Promise.all([
        ridesApi.active(),
        ridesApi.available(),
      ]);
      setActiveRide(ride);
      setAvailable(rides);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const accept = async (id) => {
    try {
      await ridesApi.accept(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 pb-32">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome, {user?.name || user?.driverName || 'Driver'}
        </h1>
        <p className="mt-2 text-slate-600">Live open rides from the API</p>
      </div>

      <button
        type="button"
        onClick={() => setOnline((v) => !v)}
        className={`mb-8 w-full rounded-2xl py-4 text-lg font-bold transition ${
          online
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
        }`}
      >
        <Zap className="mr-2 inline" size={20} />
        {online ? 'Online · Accepting rides' : 'Offline · Go online'}
      </button>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {activeRide && (
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-500 p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
            Currently · {activeRide.status}
          </p>
          <h3 className="mt-2 text-2xl font-bold">{activeRide.childName}</h3>
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-50">
            <MapPin size={16} /> {activeRide.pickup}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-emerald-50">
            <Clock size={16} /> {activeRide.date} · {activeRide.time}
          </p>
          <div className="mt-5 flex gap-2">
            <Link
              to="/driver/active"
              className="flex-1 rounded-xl bg-white/20 py-2.5 text-center text-sm font-semibold"
            >
              Trip details
            </Link>
            <Link
              to={`/live-tracking?rideId=${activeRide.id}`}
              className="flex-1 rounded-xl bg-white py-2.5 text-center text-sm font-semibold text-emerald-700"
            >
              Open map
            </Link>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">
          Available rides ({available.length})
        </h2>
        <Link to="/driver/rides" className="text-sm font-semibold text-emerald-600">
          See all
        </Link>
      </div>

      <div className="mb-8 space-y-3">
        {available.map((ride) => (
          <div key={ride.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-start justify-between">
              <h3 className="font-bold text-slate-900">{ride.childName}</h3>
              <span className="text-sm font-bold text-emerald-600">
                {formatMoney(ride.fareCents)}
              </span>
            </div>
            <div className="mb-4 space-y-1 text-sm text-slate-600">
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
              disabled={!online}
              onClick={() => accept(ride.id)}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Accept
            </button>
          </div>
        ))}
        {available.length === 0 && (
          <p className="text-sm text-slate-500">
            No open paid rides right now. Parents must pay before rides appear here.
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <AlertCircle className="mt-0.5 shrink-0 text-blue-600" size={20} />
        <div>
          <p className="font-semibold text-blue-900">Tip</p>
          <p className="mt-1 text-sm text-blue-800">
            Confirm the handover PIN with the parent before releasing a child.
          </p>
        </div>
      </div>
    </div>
  );
}
