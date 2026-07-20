import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Shield, Car, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, driversApi, formatMoney } from '../lib/api';
import { getBookingDraft, clearBookingDraft, setBookingDraft } from '../lib/booking';

const FARE_CENTS = 250000; // ₦2,500

export default function VehicleReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const draft = getBookingDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState(
    draft.driverId || null,
  );

  useEffect(() => {
    driversApi
      .active()
      .then(({ drivers: list }) => {
        setDrivers(list);
        // Prefer previously chosen, else first available, else first driver
        const preferred =
          list.find((d) => d.id === draft.driverId) ||
          list.find((d) => d.available) ||
          list[0];
        if (preferred) setSelectedDriverId(preferred.id);
      })
      .catch(() => setDrivers([]))
      .finally(() => setDriversLoading(false));
  }, [draft.driverId]);

  const selectedDriver =
    drivers.find((d) => d.id === selectedDriverId) || null;
  const availableDrivers = drivers.filter((d) => d.available);
  // Scheduled rides: show all active drivers (available first); parent may pick any
  const selectableDrivers =
    availableDrivers.length > 0 ? availableDrivers : drivers;

  const handleConfirm = async () => {
    if (!draft.childId || !draft.pickup || !draft.dropoff || !draft.date || !draft.time) {
      setError('Booking incomplete. Please start from Select children.');
      return;
    }
    if (!selectedDriver) {
      setError('Please pick a driver for this ride.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setBookingDraft({
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
      });
      const { ride } = await ridesApi.create({
        childId: draft.childId,
        driverId: selectedDriver.id,
        pickup: draft.pickup,
        dropoff: draft.dropoff,
        date: draft.date,
        time: draft.time,
        tripType: draft.tripType || 'pickup',
        fareCents: FARE_CENTS,
      });
      clearBookingDraft();
      navigate(`/payment?rideId=${ride.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create ride');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/schedule" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Choose driver</h1>
      <p className="mt-2 text-slate-600">
        Pick any available driver, review the trip, then pay securely.
      </p>

      {/* Driver list */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Available drivers
          </h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {selectableDrivers.length} ready
          </span>
        </div>

        {driversLoading && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Loading drivers…
          </p>
        )}

        {!driversLoading && selectableDrivers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            No drivers available right now. Please try again shortly.
          </p>
        )}

        <div className="space-y-3">
          {selectableDrivers.map((driver) => {
            const selected = selectedDriver?.id === driver.id;
            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => setSelectedDriverId(driver.id)}
                className={`flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                  selected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-emerald-400'
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                  👨‍✈️
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
                  <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                    <Star size={14} className="fill-amber-500 text-amber-500" />
                    {driver.rating} · {driver.completedTrips || 0} trips
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <Car size={14} />
                    <span className="font-mono text-slate-700">
                      {driver.vehiclePlate || '—'}
                    </span>
                    {driver.available ? (
                      <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Available
                      </span>
                    ) : (
                      <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        On trip
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {selected && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Trip summary */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Trip summary
        </h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Driver</span>
            <span className="font-medium text-slate-900">
              {selectedDriver?.name || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Child</span>
            <span className="font-medium text-slate-900">
              {draft.childName || user?.childName || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Pickup</span>
            <span className="max-w-[55%] text-right font-medium text-slate-900">
              {draft.pickup || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Dropoff</span>
            <span className="max-w-[55%] text-right font-medium text-slate-900">
              {draft.dropoff || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">When</span>
            <span className="font-medium text-slate-900">
              {draft.date || '—'} · {draft.time || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-slate-500">Fare</span>
            <span className="text-lg font-bold text-emerald-700">
              {formatMoney(FARE_CENTS)}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={loading || !selectedDriver || driversLoading}
        className="mt-8 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading
          ? 'Creating ride…'
          : selectedDriver
            ? `Continue with ${selectedDriver.name}`
            : 'Select a driver to continue'}
      </button>
    </div>
  );
}
