import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronRight,
  History,
  User,
  Zap,
  Car,
  Shield,
  Home,
  Navigation,
  School,
  Map,
  ArrowUpDown,
  Route,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, driversApi, formatMoney } from '../lib/api';
import {
  resolvePlace,
  captureParentLocationForBooking,
  formatDistanceKm,
  formatEtaMinutes,
  schoolLabelFromChild,
  childHasSchool,
  DEFAULT_HOME,
} from '../lib/geo';
import { quoteTripFare } from '../lib/pricing';
import { tripTypeFromModes, tripTypeHint } from '../lib/trip';
import {
  isTrackableStatus,
  rideForChild,
  tripStatusLabel,
} from '../lib/childTrips';
import AddressSearchInput from '../components/AddressSearchInput';
import DashboardDrawer, {
  HamburgerButton,
} from '../components/DashboardDrawer';
import { ErrorBanner } from '../components/ErrorState';
import PageShell from '../components/PageShell';
import TripRouteMap from '../components/TripRouteMap';

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

function SecondaryPanel({
  rides,
  school,
  bookInstant,
  instantLoading,
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900">Recent rides</h2>
        <div className="space-y-3">
          {rides.map((ride) => (
            <Link
              key={ride.id}
              to="/ride-details"
              state={ride}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {ride.childName}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {ride.date} · {ride.status}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={bookInstant}
          disabled={instantLoading}
          className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-left transition hover:bg-emerald-100 disabled:opacity-60 sm:p-5"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-emerald-900">
            <Zap size={18} /> Instant
          </h3>
          <p className="mt-1 text-sm text-emerald-800">Book &amp; pay now</p>
        </button>
        <Link
          to="/select-children"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:border-emerald-500 hover:bg-emerald-50 sm:p-5"
        >
          <h3 className="font-semibold text-slate-900">Schedule</h3>
          <p className="mt-1 text-sm text-slate-600">Plan for later</p>
        </Link>
        <Link
          to="/history"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:border-emerald-500 hover:bg-emerald-50 sm:p-5"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <History size={18} /> History
          </h3>
        </Link>
        <Link
          to="/profile"
          className="rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:border-emerald-500 hover:bg-emerald-50 sm:p-5"
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
            Only release your child after verifying the driver and the handover
            PIN.
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardMenu({
  drivers,
  availableDrivers,
  selectedDriver,
  assignMode,
  setAssignMode,
  setSelectedDriverId,
  childProfiles,
  activeRides,
  selectedChildId,
  setSelectedChildId,
  onClose,
}) {
  return (
    <nav aria-label="Dashboard menu">
      <ul className="space-y-2">
        <li>
          <Link
            to="/active-trips"
            onClick={onClose}
            className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-3 font-semibold text-emerald-800"
          >
            <span className="inline-flex items-center gap-2">
              <Route size={18} /> Active trips
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs">
              {activeRides.length}
            </span>
          </Link>
        </li>
        <li>
          <Link
            to="/select-children"
            onClick={onClose}
            className="block rounded-xl px-3 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Schedule a ride
          </Link>
        </li>
        <li>
          <Link
            to="/history"
            onClick={onClose}
            className="block rounded-xl px-3 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Ride history
          </Link>
        </li>
        <li>
          <Link
            to="/profile"
            onClick={onClose}
            className="block rounded-xl px-3 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Profile
          </Link>
        </li>

        <li className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between px-3">
            <h3 className="font-semibold text-slate-900">Active drivers</h3>
            <span className="text-xs font-medium text-emerald-700">
              {availableDrivers.length} available
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {drivers.slice(0, 6).map((driver) => {
              const selected =
                assignMode === 'choose' &&
                selectedDriver?.id === driver.id &&
                driver.available;
              return (
                <li key={driver.id}>
                  <button
                    type="button"
                    disabled={!driver.available}
                    onClick={() => {
                      setAssignMode('choose');
                      setSelectedDriverId(driver.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      selected
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    } ${driver.available ? '' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <Car size={17} className="shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {driver.name}
                        {driver.verified ? ' · Verified' : ''}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {driver.vehiclePlate || 'No plate'} · ★ {driver.rating}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        driver.available ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {driver.available ? 'Available' : 'On trip'}
                    </span>
                  </button>
                </li>
              );
            })}
            {drivers.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No drivers online right now.
              </li>
            )}
          </ul>
        </li>

        <li className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between px-3">
            <h3 className="font-semibold text-slate-900">Children</h3>
            <Link
              to="/add-child"
              onClick={onClose}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              + Add
            </Link>
          </div>
          <ul className="mt-2 space-y-1">
            {childProfiles.map((child) => {
              const trip = rideForChild(activeRides, child);
              const selected = selectedChildId === child.id;
              return (
                <li
                  key={child.id}
                  className={`rounded-xl px-3 py-2 ${
                    selected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChildId(child.id);
                        onClose();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <ChildAvatar child={child} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {child.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {trip ? tripStatusLabel(trip.status) : child.school || 'No school set'}
                        </span>
                      </span>
                    </button>
                    <Link
                      to={`/add-child?id=${child.id}`}
                      onClick={onClose}
                      className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                  {trip && isTrackableStatus(trip.status) && (
                    <Link
                      to={`/live-tracking?rideId=${trip.id}`}
                      onClick={onClose}
                      className="ml-10 mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Track ride
                    </Link>
                  )}
                </li>
              );
            })}
            {childProfiles.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No children added yet.
              </li>
            )}
          </ul>
        </li>
      </ul>
    </nav>
  );
}

export default function HomeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeRides, setActiveRides] = useState([]);
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  /** choose = pick a driver · nearest = auto-assign closest free driver */
  const [assignMode, setAssignMode] = useState('nearest');
  const [pickupMode, setPickupMode] = useState('home'); // home | current | school | custom
  const [dropoffMode, setDropoffMode] = useState('school'); // school | home | custom | current
  const [customPickup, setCustomPickup] = useState('');
  const [customPickupPlace, setCustomPickupPlace] = useState(null);
  const [customDropoff, setCustomDropoff] = useState('');
  const [customDropoffPlace, setCustomDropoffPlace] = useState(null);
  const [fareQuote, setFareQuote] = useState(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [schoolDestError, setSchoolDestError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const children = user?.children || [];

  useEffect(() => {
    if (children[0] && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    const load = () => {
      ridesApi
        .active()
        .then((res) => {
          const list = Array.isArray(res.rides)
            ? res.rides
            : res.ride
              ? [res.ride]
              : [];
          setActiveRides(list.filter(Boolean));
        })
        .catch(() => {});
      ridesApi
        .list()
        .then(({ rides: list }) => setRides(list.slice(0, 5)))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const school = user?.school || children[0]?.school || 'School';
  const selectedChild =
    children.find((c) => c.id === selectedChildId) || children[0] || null;
  const selectedSchoolLabel = schoolLabelFromChild(selectedChild);
  const selectedChildHasSchool = childHasSchool(selectedChild);
  const usesSchool =
    pickupMode === 'school' || dropoffMode === 'school';
  const tripDirection = tripTypeHint(
    tripTypeFromModes(pickupMode, dropoffMode),
  );

  const placeArgsFor = (child) => ({
    child,
    homeAddress: user?.homeAddress || DEFAULT_HOME.label,
    homeCoords: user?.homeCoords,
    schoolName: child?.school,
    schoolAddress: child?.schoolAddress || child?.school,
    schoolCoords: child?.schoolCoords,
  });

  const swapPickupAndDestination = () => {
    setPickupMode(dropoffMode);
    setDropoffMode(pickupMode);
    setCustomPickup(customDropoff);
    setCustomDropoff(customPickup);
    setCustomPickupPlace(customDropoffPlace);
    setCustomDropoffPlace(customPickupPlace);
  };

  // Rank free drivers by distance to pickup whenever locations change
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (pickupMode === 'custom' && !customPickupPlace) {
        return;
      }
      if (pickupMode === 'school' && !childHasSchool(selectedChild)) {
        return;
      }
      try {
        const from = await resolvePlace({
          mode: pickupMode,
          ...placeArgsFor(selectedChild),
          customLabel: customPickup.trim() || customPickupPlace?.label,
          customCoords: customPickupPlace,
        });
        if (cancelled) return;
        driversApi
          .active({ lng: from.lng, lat: from.lat })
          .then(({ drivers: list }) => {
            if (cancelled) return;
            setDrivers(list);
            setSelectedDriverId((prev) => {
              if (prev && list.some((d) => d.id === prev && d.available)) {
                return prev;
              }
              return list.find((d) => d.available)?.id || null;
            });
          })
          .catch(() => {
            if (!cancelled) setDrivers([]);
          });
      } catch {
        if (!cancelled) setDrivers([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // placeArgsFor is inline; depend on the fields it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pickupMode,
    selectedChild,
    customPickupPlace,
    customPickup,
    user?.homeAddress,
    user?.homeCoords,
  ]);

  // Resolve pickup and destination, then draw the route and preview fare.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedChild) {
        setFareQuote(null);
        setSchoolDestError('');
        return;
      }
      if (usesSchool && !childHasSchool(selectedChild)) {
        setFareQuote(null);
        setSchoolDestError(
          'This child has no school yet. Add a school address on the child profile.',
        );
        return;
      }
      if (
        pickupMode === 'custom' &&
        !customPickupPlace &&
        !customPickup.trim()
      ) {
        setFareQuote(null);
        setSchoolDestError('');
        return;
      }
      if (
        dropoffMode === 'custom' &&
        !customDropoffPlace &&
        !customDropoff.trim()
      ) {
        setFareQuote(null);
        setSchoolDestError('');
        return;
      }

      setSchoolDestError('');
      setFareLoading(true);
      try {
        const args = placeArgsFor(selectedChild);
        const from = await resolvePlace({
          mode: pickupMode,
          ...args,
          customLabel: customPickup.trim() || customPickupPlace?.label,
          customCoords: customPickupPlace,
        });
        const to = await resolvePlace({
          mode: dropoffMode,
          ...args,
          customLabel: customDropoff.trim() || customDropoffPlace?.label,
          customCoords: customDropoffPlace,
        });
        if (cancelled) return;
        const quote = await quoteTripFare(from, to);
        if (cancelled) return;
        setFareQuote(quote);
      } catch (err) {
        if (!cancelled) {
          setFareQuote(null);
          setSchoolDestError(
            err.message ||
              (usesSchool
                ? 'Could not place this school on the map.'
                : 'Could not resolve locations.'),
          );
        }
      } finally {
        if (!cancelled) setFareLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedChild,
    pickupMode,
    dropoffMode,
    customPickupPlace,
    customPickup,
    customDropoffPlace,
    customDropoff,
    user?.homeAddress,
    user?.homeCoords,
  ]);

  // Drivers already assigned to one of this parent's active trips stay selectable
  // only if still marked available (server flags "On trip" drivers).
  const availableDrivers = drivers.filter((d) => d.available);
  const selectedDriver =
    availableDrivers.find((d) => d.id === selectedDriverId) ||
    availableDrivers[0] ||
    null;

  const childHasActiveRide = (childId) =>
    !!rideForChild(
      activeRides,
      children.find((c) => c.id === childId),
    );

  const selectTripOnMap = (ride) => {
    const child = children.find(
      (c) =>
        (ride.childId && String(c.id) === String(ride.childId)) ||
        (ride.childName && c.name === ride.childName),
    );
    if (child) setSelectedChildId(child.id);
  };

  const bookInstant = async () => {
    setInstantError('');
    const child =
      children.find((c) => c.id === selectedChildId) || children[0];
    if (!child) {
      setInstantError('Add a child profile first, then book an instant ride.');
      return;
    }
    if (assignMode === 'choose' && !selectedDriver) {
      setInstantError('Pick an available driver, or switch to Auto · nearest.');
      return;
    }

    if (pickupMode === 'custom' && !customPickup.trim() && !customPickupPlace) {
      setInstantError('Enter a pickup address, or choose Home / School.');
      return;
    }
    if (dropoffMode === 'custom' && !customDropoff.trim() && !customDropoffPlace) {
      setInstantError('Enter a destination address, or choose School / Home.');
      return;
    }
    if (
      (pickupMode === 'school' || dropoffMode === 'school') &&
      !childHasSchool(child)
    ) {
      setInstantError(
        'This child has no school address. Add a school on the child profile, or search a destination.',
      );
      return;
    }

    setInstantLoading(true);
    try {
      const parentLocation = await captureParentLocationForBooking();
      const args = placeArgsFor(child);

      const from = await resolvePlace({
        mode: pickupMode,
        ...args,
        homeAddress: user?.homeAddress || `Home · pickup for ${child.name}`,
        customLabel: customPickup.trim() || customPickupPlace?.label,
        customCoords: customPickupPlace,
      });
      const to = await resolvePlace({
        mode: dropoffMode,
        ...args,
        customLabel: customDropoff.trim() || customDropoffPlace?.label,
        customCoords: customDropoffPlace,
      });

      // Fresh quote at book time (server recomputes authoritatively)
      const quote = await quoteTripFare(
        { lng: from.lng, lat: from.lat },
        { lng: to.lng, lat: to.lat },
      );

      const { ride } = await ridesApi.create({
        childId: child.id,
        assignMode,
        driverId:
          assignMode === 'choose' && selectedDriver
            ? selectedDriver.id
            : undefined,
        instant: true,
        tripType: tripTypeFromModes(pickupMode, dropoffMode),
        pickup: from.label,
        dropoff: to.label,
        pickupCoords: { lng: from.lng, lat: from.lat },
        dropoffCoords: { lng: to.lng, lat: to.lat },
        distanceKm: quote?.distanceKm ?? undefined,
        parentLocation: parentLocation || undefined,
      });
      // Optimistically surface the new trip so concurrent bookings stay visible
      setActiveRides((prev) => {
        const next = [ride, ...prev.filter((r) => r.id !== ride.id)];
        return next;
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

  const secondaryProps = {
    rides,
    school,
    bookInstant,
    instantLoading,
  };

  return (
    <PageShell width="lg" className="md:pb-10">
      <div className="mb-6 flex items-start gap-3 sm:mb-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Welcome back, {user?.name || user?.parentName || 'Parent'}
          </h1>
          <p className="mt-2 text-slate-600">
            {availableDrivers.length > 0
              ? `${availableDrivers.length} driver${availableDrivers.length === 1 ? '' : 's'} ready nearby`
              : 'Book a ride for your child'}
          </p>
          {user?.homeAddress ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
              <Home size={14} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{user.homeAddress}</span>
            </p>
          ) : null}
        </div>
        <HamburgerButton
          open={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
          className="mt-0.5"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-10">
        {/* Primary column */}
        <div className="space-y-8 lg:col-span-3">
          {activeRides.length > 0 && (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Family map</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {activeRides.length} active trip{activeRides.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Link
                  to="/active-trips"
                  className="shrink-0 text-sm font-semibold text-emerald-700 hover:underline"
                >
                  View trips
                </Link>
              </div>
              <TripRouteMap
                trips={activeRides}
                childProfiles={children}
                focusChildId={selectedChildId}
                onSelectTrip={selectTripOnMap}
                className="h-64 sm:h-80"
              />
            </section>
          )}

          {/* Instant ride */}
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  <Zap size={14} className="fill-emerald-300" /> Instant ride
                </p>
                <h2 className="mt-2 text-lg font-bold sm:text-xl">
                  Need a driver now?
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Book immediately, pay by card or bank transfer, then track
                  live.
                </p>
              </div>
            </div>

            {children.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {children.map((c) => {
                  const busy = childHasActiveRide(c.id);
                  const selected = selectedChildId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedChildId(c.id)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        selected
                          ? 'bg-white text-slate-900'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <ChildAvatar child={c} size="sm" />
                      <span className="pr-1">{c.name}</span>
                      {busy ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            selected
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-white/20 text-emerald-100'
                          }`}
                        >
                          Active
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            {activeRides.length > 0 && (
              <p className="mt-3 text-xs text-emerald-200/90">
                You can book another ride while others are in progress — pick a
                child, then choose a driver or auto-assign the nearest one.
              </p>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Pickup location
                  </p>
                  <span className="truncate text-[11px] font-medium text-emerald-200/80">
                    {tripDirection}
                  </span>
                </div>
                
                
                 {/* Pickup options */}
                <div className="flex justify-left mb-3">
                <button
                  type="button"
                  onClick={swapPickupAndDestination}
                  aria-label="Swap pickup and destination"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
                >
                  <ArrowUpDown size={14} /> Swap pickup & destination
                </button>
              </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    <Navigation size={16} /> Current
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickupMode('school')}
                    className={`col-span-2 flex items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition sm:col-span-1 ${
                      pickupMode === 'school'
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <School size={16} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">School</span>
                      <span
                        className={`mt-0.5 block truncate text-[11px] font-normal ${
                          pickupMode === 'school'
                            ? 'text-slate-500'
                            : 'text-slate-300'
                        }`}
                      >
                        {selectedSchoolLabel || 'Child’s school'}
                      </span>
                    </span>
                  </button>
                </div>
                {pickupMode === 'custom' && (
                  <div className="mt-2">
                    <AddressSearchInput
                      dark
                      value={customPickup}
                      onChange={(v) => {
                        setCustomPickup(v);
                        setCustomPickupPlace(null);
                      }}
                      onSelect={(place) => {
                        setCustomPickup(place.label);
                        setCustomPickupPlace({
                          label: place.label,
                          lng: place.lng,
                          lat: place.lat,
                        });
                      }}
                      placeholder="Search pickup address…"
                    />
                  </div>
                )}
              </div>


              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  Destination
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setDropoffMode('school')}
                    className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      dropoffMode === 'school'
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <School size={16} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">School</span>
                      <span
                        className={`mt-0.5 block truncate text-[11px] font-normal ${
                          dropoffMode === 'school'
                            ? 'text-slate-500'
                            : 'text-slate-300'
                        }`}
                      >
                        {selectedSchoolLabel ||
                          'Add a school on the child profile'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDropoffMode('home')}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      dropoffMode === 'home'
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <Home size={16} /> Home
                  </button>
                  <button
                    type="button"
                    onClick={() => setDropoffMode('custom')}
                    className={`col-span-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition sm:col-span-1 ${
                      dropoffMode === 'custom'
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <Map size={16} /> Desired place
                  </button>
                  {dropoffMode === 'current' && (
                    <button
                      type="button"
                      onClick={() => setDropoffMode('current')}
                      className="col-span-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-900 sm:col-span-3"
                    >
                      <Navigation size={16} /> Current location
                    </button>
                  )}
                </div>
                {dropoffMode === 'custom' && (
                  <div className="mt-2">
                    <AddressSearchInput
                      dark
                      value={customDropoff}
                      onChange={(v) => {
                        setCustomDropoff(v);
                        setCustomDropoffPlace(null);
                      }}
                      onSelect={(place) => {
                        setCustomDropoff(place.label);
                        setCustomDropoffPlace({
                          label: place.label,
                          lng: place.lng,
                          lat: place.lat,
                        });
                      }}
                      placeholder="Search destination address…"
                    />
                  </div>
                )}
                {usesSchool &&
                  selectedChild &&
                  !selectedChildHasSchool && (
                    <p className="mt-2 text-xs text-amber-200">
                      No school pin for {selectedChild.name}.{' '}
                      <Link
                        to={`/add-child?id=${selectedChild.id}`}
                        className="font-semibold underline underline-offset-2"
                      >
                        Add school address
                      </Link>
                    </p>
                  )}
              </div>
            </div>

            {(fareLoading || fareQuote || schoolDestError) && (
              <div className="mt-3 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-200">
                {schoolDestError ? (
                  <p className="text-amber-200">{schoolDestError}</p>
                ) : fareLoading && !fareQuote ? (
                  <p>Calculating route and fare…</p>
                ) : fareQuote ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {formatDistanceKm(fareQuote.distanceKm) || '—'}
                      {fareQuote.etaMinutes != null
                        ? ` · ${formatEtaMinutes(fareQuote.etaMinutes)}`
                        : ''}
                    </span>
                    <span className="font-bold text-white">
                      {formatMoney(fareQuote.fareCents)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Driver assignment
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignMode('nearest')}
                  className={`rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    assignMode === 'nearest'
                      ? 'bg-white font-semibold text-slate-900'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <span className="block">Auto · nearest</span>
                  <span
                    className={`mt-0.5 block text-[11px] font-normal ${
                      assignMode === 'nearest'
                        ? 'text-slate-500'
                        : 'text-slate-300'
                    }`}
                  >
                    Closest free driver by GPS
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('choose')}
                  className={`rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    assignMode === 'choose'
                      ? 'bg-white font-semibold text-slate-900'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <span className="block">Choose driver</span>
                  <span
                    className={`mt-0.5 block text-[11px] font-normal ${
                      assignMode === 'choose'
                        ? 'text-slate-500'
                        : 'text-slate-300'
                    }`}
                  >
                    Pick who you prefer
                  </span>
                </button>
              </div>

              {assignMode === 'nearest' ? (
                <p className="rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-200">
                  We’ll match the closest free driver to your pickup after you
                  pay
                  {availableDrivers[0]?.distanceKm != null
                    ? ` · nearest now ~${formatDistanceKm(availableDrivers[0].distanceKm)} away`
                    : ''}
                  .
                </p>
              ) : availableDrivers.length > 0 ? (
                <div className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
                  {availableDrivers.map((driver) => {
                    const selected = selectedDriver?.id === driver.id;
                    return (
                      <button
                        key={driver.id}
                        type="button"
                        onClick={() => {
                          setAssignMode('choose');
                          setSelectedDriverId(driver.id);
                        }}
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
                                className={
                                  selected
                                    ? 'text-emerald-600'
                                    : 'text-emerald-300'
                                }
                              />
                            )}
                          </div>
                          <p
                            className={`mt-0.5 truncate text-xs ${
                              selected ? 'text-slate-500' : 'text-slate-300'
                            }`}
                          >
                            {driver.vehiclePlate || 'No plate'} · ★{' '}
                            {driver.rating}
                            {driver.distanceKm != null
                              ? ` · ${formatDistanceKm(driver.distanceKm)}`
                              : ''}
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
                  No drivers available right now. Try Auto · nearest, schedule
                  later, or check back soon.
                </p>
              )}
            </div>

            {instantError && (
              <ErrorBanner
                variant="dark"
                title="Couldn’t book ride"
                message={instantError}
                onDismiss={() => setInstantError('')}
                className="mt-3"
              />
            )}

            <button
              type="button"
              onClick={bookInstant}
              disabled={
                instantLoading ||
                children.length === 0 ||
                (usesSchool && !selectedChildHasSchool) ||
                (pickupMode === 'custom' &&
                  !customPickupPlace &&
                  !customPickup.trim()) ||
                (dropoffMode === 'custom' &&
                  !customDropoffPlace &&
                  !customDropoff.trim()) ||
                (assignMode === 'choose' && availableDrivers.length === 0)
              }
              className="mt-5 w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {instantLoading
                ? 'Creating ride…'
                : children.length === 0
                  ? 'Add a child to book'
                  : usesSchool && !selectedChildHasSchool
                    ? 'Add a school to book'
                    : assignMode === 'choose' && availableDrivers.length === 0
                    ? 'No drivers available'
                    : (() => {
                        const fareBit = fareQuote
                          ? ` · ${formatMoney(fareQuote.fareCents)}`
                          : '';
                        if (assignMode === 'nearest') {
                          return activeRides.length > 0
                            ? `Book another · nearest${fareBit}`
                            : `Book nearest driver${fareBit}`;
                        }
                        if (selectedDriver) {
                          return activeRides.length > 0
                            ? `Book another · ${selectedDriver.name}${fareBit}`
                            : `Book ${selectedDriver.name}${fareBit}`;
                        }
                        return `Book instant ride${fareBit}`;
                      })()}
            </button>
            <Link
              to="/select-children"
              className="mt-3 block text-center text-sm font-medium text-slate-300 underline-offset-2 hover:text-white hover:underline"
            >
              Or schedule a ride for later
            </Link>
          </div>

        </div>

        {/* Desktop secondary column — recent rides & shortcuts */}
        <aside className="hidden lg:col-span-2 lg:block">
          <div className="sticky top-20 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <SecondaryPanel {...secondaryProps} />
          </div>
        </aside>
      </div>

      {/* Left sidebar drawer — hamburger menu (all breakpoints) */}
      <DashboardDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        onClose={() => setDrawerOpen(false)}
        title="Activity & shortcuts"
      >
        <DashboardMenu
          drivers={drivers}
          availableDrivers={availableDrivers}
          selectedDriver={selectedDriver}
          assignMode={assignMode}
          setAssignMode={setAssignMode}
          setSelectedDriverId={setSelectedDriverId}
          childProfiles={children}
          activeRides={activeRides}
          selectedChildId={selectedChildId}
          setSelectedChildId={setSelectedChildId}
          onClose={() => setDrawerOpen(false)}
        />
      </DashboardDrawer>
    </PageShell>
  );
}
