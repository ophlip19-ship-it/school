import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Clock, Navigation, UserCheck } from 'lucide-react';
import { ridesApi, formatMoney } from '../lib/api';

export default function DriverAvailableRides() {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () =>
    ridesApi
      .available()
      .then(({ rides: list }) => setRides(list))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const requests = rides.filter((r) => r.status === 'requested');
  const openPool = rides.filter((r) => r.status === 'open');

  const accept = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await ridesApi.accept(id);
      navigate('/driver/active');
    } catch (err) {
      setError(err.message);
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await ridesApi.reject(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const renderRide = (ride, preferred) => (
    <div
      key={ride.id}
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        preferred ? 'border-amber-300' : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          {preferred && (
            <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              <UserCheck size={12} /> Requested for you
            </p>
          )}
          <h3 className="text-lg font-bold text-slate-900">{ride.childName}</h3>
        </div>
        <span className="font-bold text-emerald-600">
          {formatMoney(ride.fareCents)}
        </span>
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
      {preferred ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busyId === ride.id}
            onClick={() => accept(ride.id)}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busyId === ride.id}
            onClick={() => reject(ride.id)}
            className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busyId === ride.id}
          onClick={() => accept(ride.id)}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Accept ride
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <Link to="/driver" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Available rides</h1>
      <p className="mt-2 text-slate-600">
        {requests.length} preferred · {openPool.length} open pool
      </p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {requests.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
            Requested for you
          </h2>
          <div className="space-y-4">
            {requests.map((ride) => renderRide(ride, true))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Open pool
        </h2>
        <div className="space-y-4">
          {openPool.map((ride) => renderRide(ride, false))}
          {openPool.length === 0 && !error && (
            <p className="text-center text-slate-500">
              No open pool rides. Check back soon.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
