import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Clock, Phone, MessageSquare } from 'lucide-react';
import { ridesApi } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { watchPosition } from '../lib/geo';

export default function DriverTripActive() {
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    ridesApi
      .active()
      .then(({ ride: r }) => setRide(r))
      .catch((err) => setError(err.message));
  }, []);

  // Share GPS so parents see the blue trail in real time
  useEffect(() => {
    if (!ride?.id) return undefined;
    if (!['assigned', 'in_transit'].includes(ride.status)) return undefined;

    const token = localStorage.getItem('schoolrun_token');
    const socket = connectSocket(token);
    socket.emit('ride:join', { rideId: ride.id });
    setSharing(true);

    const stopWatch = watchPosition(
      (pos) => {
        const s = getSocket();
        if (s?.connected) {
          s.emit('ride:location', {
            rideId: ride.id,
            lng: pos.lng,
            lat: pos.lat,
            heading: pos.heading || 0,
          });
        } else {
          ridesApi
            .updateLocation(ride.id, {
              lng: pos.lng,
              lat: pos.lat,
              heading: pos.heading || 0,
            })
            .catch(() => {});
        }
      },
      () => setSharing(false),
    );

    return () => {
      stopWatch();
      socket.emit('ride:leave', { rideId: ride.id });
      setSharing(false);
    };
  }, [ride?.id, ride?.status]);

  const updateStatus = async (status) => {
    if (!ride) return;
    try {
      const { ride: updated } = await ridesApi.setStatus(ride.id, status);
      setRide(updated);
      if (status === 'completed') navigate('/driver');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!ride && !error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-slate-600">No active trip.</p>
        <Link to="/driver/rides" className="mt-4 inline-block text-emerald-600">
          Browse available rides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <Link to="/driver" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Active trip</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {ride && (
        <>
          <div className="mt-8 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
              {ride.status}
            </p>
            {sharing && (
              <p className="mt-1 text-xs font-medium text-emerald-100">
                ● Live location sharing on — parent can track you
              </p>
            )}
            <h2 className="mt-2 text-3xl font-bold">{ride.childName}</h2>
            <div className="mt-4 space-y-2 text-sm text-emerald-50">
              <p className="flex items-center gap-2">
                <MapPin size={16} /> {ride.pickup}
              </p>
              <p className="flex items-center gap-2">
                <Clock size={16} /> {ride.date} · {ride.time}
              </p>
              <p>Parent: {ride.parentName}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Handover PIN</p>
            <p className="mt-1 font-mono text-5xl font-black tracking-widest">
              {ride.handoverPin}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <a
              href={`tel:${ride.parentPhone || ''}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 font-semibold text-slate-800"
            >
              <Phone size={18} /> Call
            </a>
            <Link
              to={`/chat?rideId=${ride.id}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 font-semibold text-slate-800"
            >
              <MessageSquare size={18} /> Chat
            </Link>
          </div>

          <Link
            to={`/live-tracking?rideId=${ride.id}`}
            className="mt-4 block w-full rounded-2xl bg-emerald-600 py-4 text-center font-semibold text-white"
          >
            Open live map
          </Link>
          {ride.status === 'assigned' && (
            <button
              type="button"
              onClick={() => updateStatus('in_transit')}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-4 font-semibold text-slate-800"
            >
              Start trip (in transit)
            </button>
          )}
          <button
            type="button"
            onClick={() => updateStatus('completed')}
            className="mt-3 w-full rounded-2xl bg-slate-900 py-4 font-semibold text-white"
          >
            Mark completed
          </button>
        </>
      )}
    </div>
  );
}
