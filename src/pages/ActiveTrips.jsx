import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Route } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi } from '../lib/api';
import { childForRide } from '../lib/childTrips';
import ActiveRideCard from '../components/ActiveRideCard';
import PageShell from '../components/PageShell';
import TripRouteMap from '../components/TripRouteMap';
import { ErrorBanner } from '../components/ErrorState';

export default function ActiveTrips() {
  const { user } = useAuth();
  const children = user?.children || [];
  const [rides, setRides] = useState([]);
  const [focusedChildId, setFocusedChildId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const loadActiveRides = useCallback(async () => {
    try {
      const result = await ridesApi.active();
      const list = Array.isArray(result.rides)
        ? result.rides
        : result.ride
          ? [result.ride]
          : [];
      setRides(list.filter(Boolean));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load active trips.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveRides();
    const timer = setInterval(loadActiveRides, 10000);
    return () => clearInterval(timer);
  }, [loadActiveRides]);

  const focusTrip = (ride) => {
    const child = childForRide(children, ride);
    if (child) setFocusedChildId(child.id);
  };

  const cancelRide = async (ride) => {
    if (!ride?.id || cancellingId) return;
    const label =
      ride.status === 'pending_payment'
        ? 'Cancel this unpaid trip?'
        : 'Cancel this trip before a driver accepts?';
    if (!window.confirm(label)) return;

    setCancelError('');
    setCancellingId(ride.id);
    try {
      await ridesApi.cancel(ride.id);
      setRides((current) => current.filter((item) => item.id !== ride.id));
    } catch (err) {
      setCancelError(err.message || 'Could not cancel trip.');
      await loadActiveRides();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <PageShell width="lg">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={16} /> Dashboard
      </Link>

      <header className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Active trips
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Follow rides for your family and manage upcoming pickups.
          </p>
        </div>
        {rides.length > 0 && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
            {rides.length} {rides.length === 1 ? 'trip' : 'trips'}
          </span>
        )}
      </header>

      {cancelError && (
        <ErrorBanner
          title="Couldn’t cancel trip"
          message={cancelError}
          onDismiss={() => setCancelError('')}
          className="mt-5"
        />
      )}
      {error && (
        <ErrorBanner
          title="Couldn’t load trips"
          message={error}
          onDismiss={() => setError('')}
          className="mt-5"
        />
      )}

      {loading ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          Loading active trips…
        </p>
      ) : rides.length > 0 ? (
        <div className="mt-6 space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Route size={18} className="text-emerald-700" />
              <h2 className="font-semibold text-slate-900">Your rides</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rides.map((ride) => (
                <ActiveRideCard
                  key={ride.id}
                  ride={ride}
                  child={childForRide(children, ride)}
                  onCancel={cancelRide}
                  cancelling={cancellingId === ride.id}
                  onSelect={focusTrip}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="font-semibold text-slate-900">Family map</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Tap a trip to focus its route and location.
              </p>
            </div>
            <TripRouteMap
              trips={rides}
              childProfiles={children}
              focusChildId={focusedChildId}
              onSelectTrip={focusTrip}
              className="h-72 sm:h-96"
            />
          </section>
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Route size={23} />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            No active trips
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Your family’s current rides will show up here.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Book a ride
          </Link>
        </div>
      )}
    </PageShell>
  );
}
