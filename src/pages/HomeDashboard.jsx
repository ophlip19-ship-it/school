import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Clock,
  AlertCircle,
  Plus,
  ChevronRight,
  History,
  User,
  MessageSquare,
  Zap,
  Car,
  Star,
  Shield,
  Camera,
  Home,
  Navigation,
  School,
  Map,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, driversApi, formatMoney } from '../lib/api';
import { resolveDestination, resolvePickup } from '../lib/geo';

function ChildAvatar({ child, size = 'md' }) {
  const dim =
    size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-7 w-7' : 'h-12 w-12';
  const text = size === 'sm' ? 'text-xs' : 'text-lg';
  const radius = size === 'sm' ? 'rounded-full' : 'rounded-2xl';
  if (child?.photoUrl) {
    return (
      <img
        src={child.photoUrl}
        alt={child.name}
        className={`${dim} ${radius} shrink-0 object-cover ring-2 ring-white shadow-sm`}
      />
    );
  }
  const initial = (child?.name || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`${dim} ${radius} ${text} flex shrink-0 items-center justify-center bg-emerald-100 font-bold text-emerald-700 ring-2 ring-white`}
    >
      {initial}
    </div>
  );
}

export default function HomeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeRide, setActiveRide] = useState(null);
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [pickupMode, setPickupMode] = useState('home'); // home | current
  const [dropoffMode, setDropoffMode] = useState('school'); // school | custom
  const [customDropoff, setCustomDropoff] = useState('');

  const children = user?.children || [];

  useEffect(() => {
    if (children[0] && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    ridesApi.active().then(({ ride }) => setActiveRide(ride)).catch(() => {});
    ridesApi.list().then(({ rides: list }) => setRides(list.slice(0, 5))).catch(() => {});
    driversApi
      .active()
      .then(({ drivers: list }) => {
        setDrivers(list);
        const firstAvailable = list.find((d) => d.available);
        if (firstAvailable) setSelectedDriverId(firstAvailable.id);
      })
      .catch(() => setDrivers([]));
  }, []);

  const childName = user?.childName || children[0]?.name || 'your child';
  const school = user?.school || children[0]?.school || 'School';
  const availableDrivers = drivers.filter((d) => d.available);
  const selectedDriver =
    availableDrivers.find((d) => d.id === selectedDriverId) ||
    availableDrivers[0] ||
    null;

  const bookInstant = async () => {
    setInstantError('');
    const child =
      children.find((c) => c.id === selectedChildId) || children[0];
    if (!child) {
      setInstantError('Add a child profile first, then book an instant ride.');
      return;
    }
    if (activeRide) {
      setInstantError('You already have an active trip. Track it or wait until it finishes.');
      return;
    }
    if (!selectedDriver) {
      setInstantError('Pick an available driver to book an instant ride.');
      return;
    }

    if (dropoffMode === 'custom' && !customDropoff.trim()) {
      setInstantError('Enter a destination address, or choose School.');
      return;
    }

    setInstantLoading(true);
    try {
      const from = await resolvePickup({
        mode: pickupMode === 'current' ? 'current' : 'home',
        homeAddress: user?.homeAddress || `Home · pickup for ${child.name}`,
        homeCoords: user?.homeCoords,
      });
      const to = await resolveDestination({
        mode: dropoffMode === 'custom' ? 'custom' : 'school',
        schoolName: child.school || school,
        customLabel: customDropoff.trim(),
      });

      const { ride } = await ridesApi.create({
        childId: child.id,
        driverId: selectedDriver.id,
        instant: true,
        tripType: 'pickup',
        pickup: from.label,
        dropoff: to.label,
        pickupCoords: { lng: from.lng, lat: from.lat },
        dropoffCoords: { lng: to.lng, lat: to.lat },
      });
      navigate(`/payment?rideId=${ride.id}`);
    } catch (err) {
      setInstantError(
        err?.message?.includes('denied') || err?.code === 1
          ? 'Location permission denied. Choose Home pickup or allow location access.'
          : err.message || 'Could not start instant ride',
      );
    } finally {
      setInstantLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome back, {user?.name || user?.parentName || 'Parent'}
        </h1>
        <p className="mt-2 text-slate-600">
          {availableDrivers.length > 0
            ? `${availableDrivers.length} driver${availableDrivers.length === 1 ? '' : 's'} ready nearby`
            : 'Book a ride for your child'}
        </p>
      </div>

      {/* Instant ride */}
      <div className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-300">
              <Zap size={14} className="fill-emerald-300" /> Instant ride
            </p>
            <h2 className="mt-2 text-xl font-bold">Need a driver now?</h2>
            <p className="mt-1 text-sm text-slate-300">
              Book immediately, pay by card or bank transfer, then track live.
            </p>
          </div>
        </div>

        {children.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedChildId(c.id)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  selectedChildId === c.id
                    ? 'bg-white text-slate-900'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <ChildAvatar child={c} size="sm" />
                <span className="pr-1">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Pickup & destination for driver */}
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Pickup location
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPickupMode('home')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  pickupMode === 'home'
                    ? 'bg-white font-semibold text-slate-900'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Home size={16} /> Home
              </button>
              <button
                type="button"
                onClick={() => setPickupMode('current')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  pickupMode === 'current'
                    ? 'bg-white font-semibold text-slate-900'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Navigation size={16} /> Current location
              </button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Destination
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDropoffMode('school')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  dropoffMode === 'school'
                    ? 'bg-white font-semibold text-slate-900'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <School size={16} /> School
              </button>
              <button
                type="button"
                onClick={() => setDropoffMode('custom')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  dropoffMode === 'custom'
                    ? 'bg-white font-semibold text-slate-900'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Map size={16} /> Desired place
              </button>
            </div>
            {dropoffMode === 'custom' && (
              <input
                value={customDropoff}
                onChange={(e) => setCustomDropoff(e.target.value)}
                placeholder="Enter destination address"
                className="mt-2 w-full rounded-xl border-0 bg-white/95 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            )}
          </div>
        </div>

        {/* Driver picker for instant ride */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Choose your driver
          </p>
          {availableDrivers.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
              {availableDrivers.map((driver) => {
                const selected = selectedDriver?.id === driver.id;
                return (
                  <button
                    key={driver.id}
                    type="button"
                    onClick={() => setSelectedDriverId(driver.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      selected
                        ? 'bg-white text-slate-900 shadow-md'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                        selected ? 'bg-emerald-100' : 'bg-white/10'
                      }`}
                    >
                      🚗
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {driver.name}
                        </span>
                        {driver.verified && (
                          <Shield
                            size={12}
                            className={selected ? 'text-emerald-600' : 'text-emerald-300'}
                          />
                        )}
                      </div>
                      <p
                        className={`mt-0.5 truncate text-xs ${
                          selected ? 'text-slate-500' : 'text-slate-300'
                        }`}
                      >
                        {driver.vehiclePlate || 'No plate'} · ★ {driver.rating}
                      </p>
                    </div>
                    <span
                      className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                        selected
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-white/40'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-300">
              No drivers available right now. Try scheduling a ride for later, or check back soon.
            </p>
          )}
        </div>

        {instantError && (
          <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {instantError}
          </p>
        )}

        <button
          type="button"
          onClick={bookInstant}
          disabled={
            instantLoading ||
            children.length === 0 ||
            availableDrivers.length === 0
          }
          className="mt-5 w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {instantLoading
            ? 'Creating ride…'
            : children.length === 0
              ? 'Add a child to book'
              : availableDrivers.length === 0
                ? 'No drivers available'
                : selectedDriver
                  ? `Book ${selectedDriver.name} · ${formatMoney(300000)}`
                  : `Book instant ride · ${formatMoney(300000)}`}
        </button>
        <Link
          to="/select-children"
          className="mt-3 block text-center text-sm font-medium text-slate-300 underline-offset-2 hover:text-white hover:underline"
        >
          Or schedule a ride for later
        </Link>
      </div>

      {activeRide ? (
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-500 p-6 text-white shadow-lg shadow-emerald-600/20">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
            Active trip · {activeRide.status}
          </p>
          <h3 className="mt-2 text-2xl font-bold">{activeRide.childName}</h3>
          <div className="mt-4 space-y-1 text-sm text-emerald-50">
            <p>Driver: {activeRide.driverName || 'Waiting for driver…'}</p>
            <p className="flex items-center gap-2">
              <Clock size={16} /> {activeRide.date} · {activeRide.time}
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={16} /> {activeRide.pickup}
            </p>
            {activeRide.paymentStatus === 'paid' && (
              <p>PIN: {activeRide.handoverPin}</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to={`/live-tracking?rideId=${activeRide.id}`}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700"
            >
              Track live
            </Link>
            <Link
              to={`/chat?rideId=${activeRide.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold"
            >
              <MessageSquare size={16} /> Chat
            </Link>
            {activeRide.paymentStatus !== 'paid' && (
              <Link
                to={`/payment?rideId=${activeRide.id}`}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950"
              >
                Pay now
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {/* Active drivers — tap to select for instant ride */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Active drivers</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {availableDrivers.length} available
          </span>
        </div>
        <div className="space-y-3">
          {drivers.slice(0, 6).map((driver) => {
            const selected = selectedDriver?.id === driver.id && driver.available;
            return (
              <button
                key={driver.id}
                type="button"
                disabled={!driver.available}
                onClick={() => {
                  if (driver.available) {
                    setSelectedDriverId(driver.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                  selected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : driver.available
                      ? 'border-slate-200 hover:border-emerald-400'
                      : 'cursor-not-allowed border-slate-200 opacity-70'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                  🚗
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900">
                      {driver.name}
                    </h3>
                    {driver.verified && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        <Shield size={10} /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                    <Car size={14} />
                    <span className="font-mono text-slate-700">
                      {driver.vehiclePlate || '—'}
                    </span>
                    <span className="mx-1">·</span>
                    <Star size={12} className="fill-amber-400 text-amber-400" />
                    {driver.rating}
                  </p>
                  {driver.available && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      {selected ? 'Selected for instant ride' : 'Tap to select for instant ride'}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    driver.available
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {driver.available ? 'Available' : 'On trip'}
                </span>
              </button>
            );
          })}
          {drivers.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No drivers online right now. Check back soon or schedule a ride for later.
            </p>
          )}
        </div>
      </div>

      {/* Children with photos */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Your children</h2>
          <Link
            to="/add-child"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Add
          </Link>
        </div>
        <div className="space-y-3">
          {children.map((child) => (
            <div
              key={child.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <ChildAvatar child={child} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900">{child.name}</h3>
                <p className="text-sm text-slate-600">
                  {child.school} · {child.grade}
                </p>
              </div>
              <Link
                to="/add-child"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
                title="Edit profile / photo"
              >
                <Camera size={14} />
                {child.photoUrl ? 'Edit' : 'Photo'}
              </Link>
            </div>
          ))}
          {children.length === 0 && (
            <p className="text-sm text-slate-500">
              No children yet — add one to book rides.
            </p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Recent rides</h2>
        <div className="space-y-3">
          {rides.map((ride) => (
            <Link
              key={ride.id}
              to="/ride-details"
              state={ride}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-semibold text-slate-900">{ride.childName}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {ride.date} · {ride.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-emerald-700">
                  {formatMoney(ride.fareCents)}
                </span>
                <ChevronRight className="text-slate-400" size={18} />
              </div>
            </Link>
          ))}
          {rides.length === 0 && (
            <p className="text-sm text-slate-500">No rides yet for {school}.</p>
          )}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={bookInstant}
          disabled={instantLoading}
          className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 text-left transition hover:bg-emerald-100 disabled:opacity-60"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-emerald-900">
            <Zap size={18} /> Instant
          </h3>
          <p className="mt-1 text-sm text-emerald-800">Book &amp; pay now</p>
        </button>
        <Link
          to="/select-children"
          className="rounded-2xl border-2 border-slate-200 bg-white p-5 transition hover:border-emerald-500 hover:bg-emerald-50"
        >
          <h3 className="font-semibold text-slate-900">Schedule</h3>
          <p className="mt-1 text-sm text-slate-600">Plan for later</p>
        </Link>
        <Link
          to="/history"
          className="rounded-2xl border-2 border-slate-200 bg-white p-5 transition hover:border-emerald-500 hover:bg-emerald-50"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <History size={18} /> History
          </h3>
        </Link>
        <Link
          to="/profile"
          className="rounded-2xl border-2 border-slate-200 bg-white p-5 transition hover:border-emerald-500 hover:bg-emerald-50"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <User size={18} /> Profile
          </h3>
        </Link>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={20} />
        <div>
          <p className="font-semibold text-amber-900">Safety reminder</p>
          <p className="mt-1 text-sm text-amber-800">
            Only release your child after verifying the driver and the handover PIN.
          </p>
        </div>
      </div>
    </div>
  );
}
