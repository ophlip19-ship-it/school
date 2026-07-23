import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Clock, Phone, MessageSquare, Navigation, CheckCircle2 } from 'lucide-react';
import { ridesApi } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { watchPosition } from '../lib/geo';

export default function DriverTripActive() {
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ridesApi
      .active()
      .then(({ ride: r }) => setRide(r))
      .catch((err) => setError(err.message));
  }, []);

  // Share GPS with parent only after pickup is confirmed (in_transit + locationSharing)
  useEffect(() => {
    if (!ride?.id) return undefined;
    const canShare =
      ride.status === 'in_transit' && (ride.locationSharing !== false);

    if (!canShare) {
      setSharing(false);
      return undefined;
    }

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
  }, [ride?.id, ride?.status, ride?.locationSharing]);

  const updateStatus = async (status) => {
    if (!ride) return;
    setBusy(true);
    setError('');
    try {
      const { ride: updated } = await ridesApi.setStatus(ride.id, status);
      setRide(updated);
      if (status === 'completed') {
        setSharing(false);
        navigate('/driver');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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

  const awaitingPickup = ride?.status === 'assigned';
  const inTransit = ride?.status === 'in_transit';

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
              {ride.status === 'assigned'
                ? 'Awaiting pickup'
                : String(ride.status || '').replace(/_/g, ' ')}
            </p>
            {awaitingPickup && (
              <p className="mt-1 text-xs font-medium text-emerald-100">
                Parent cannot see your location until you confirm pickup
              </p>
            )}
            {sharing && inTransit && (
              <p className="mt-1 text-xs font-medium text-emerald-100">
                ● Live location sharing on — parent can track you
              </p>
            )}
            {inTransit && !sharing && (
              <p className="mt-1 text-xs font-medium text-amber-100">
                Enable device location to share with parent
              </p>
            )}
            <h2 className="mt-2 text-3xl font-bold">{ride.childName}</h2>
            <div className="mt-4 space-y-2 text-sm text-emerald-50">
              <p className="flex items-center gap-2">
                <MapPin size={16} /> {ride.pickup}
              </p>
              <p className="flex items-center gap-2">
                <Navigation size={16} /> {ride.dropoff}
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

          {awaitingPickup && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateStatus('in_transit')}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-600 bg-white py-4 font-semibold text-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 size={20} />
              Confirm pickup &amp; start sharing
            </button>
          )}

          {inTransit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateStatus('completed')}
              className="mt-3 w-full rounded-2xl bg-slate-900 py-4 font-semibold text-white disabled:opacity-60"
            >
              Mark drop-off / delivered
            </button>
          )}

          {awaitingPickup && (
            <button
              type="button"
              disabled={busy}
              onClick={() => updateStatus('completed')}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 disabled:opacity-60"
            >
              Cancel / complete without transit
            </button>
          )}
        </>
      )}
    </div>
  );
}
