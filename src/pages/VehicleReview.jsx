import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Shield, Car } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, formatMoney } from '../lib/api';
import { getBookingDraft, clearBookingDraft } from '../lib/booking';

const FARE_CENTS = 250000; // ₦2,500

export default function VehicleReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const draft = getBookingDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const driver = {
    name: 'David K.',
    plate: '56A-902-LGS',
    vehicle: 'Toyota Hiace · White',
    rating: 4.9,
    trips: 412,
  };

  const handleConfirm = async () => {
    if (!draft.childId || !draft.pickup || !draft.dropoff || !draft.date || !draft.time) {
      setError('Booking incomplete. Please start from Select children.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { ride } = await ridesApi.create({
        childId: draft.childId,
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
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Review &amp; book</h1>
      <p className="mt-2 text-slate-600">Confirm details, then pay securely.</p>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
            👨‍✈️
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">{driver.name}</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
              <Star size={14} className="fill-amber-500 text-amber-500" />
              {driver.rating} · {driver.trips} trips
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Shield size={12} /> Verified
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-500">
              <Car size={16} /> Vehicle
            </span>
            <span className="font-medium text-slate-900">{driver.vehicle}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Plate</span>
            <span className="font-mono font-semibold text-slate-900">{driver.plate}</span>
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
            <span className="text-slate-500">When</span>
            <span className="font-medium text-slate-900">
              {draft.date || '—'} · {draft.time || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Fare</span>
            <span className="text-lg font-bold text-emerald-700">{formatMoney(FARE_CENTS)}</span>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={loading}
        className="mt-8 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? 'Creating ride…' : 'Continue to payment'}
      </button>
    </div>
  );
}
