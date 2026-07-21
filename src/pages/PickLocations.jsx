import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Home, Navigation, School, Map } from 'lucide-react';
import { getBookingDraft, setBookingDraft } from '../lib/booking';
import { useAuth } from '../context/AuthContext';
import { resolveDestination, resolvePickup } from '../lib/geo';

export default function PickLocations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const draft = getBookingDraft();
  const school = draft.school || user?.school || user?.children?.[0]?.school || 'Greenfield School';
  const homeAddress = user?.homeAddress || 'Home · 12 Admiralty Way, Lekki';

  const [pickupMode, setPickupMode] = useState(draft.pickupMode || 'home');
  const [dropoffMode, setDropoffMode] = useState(draft.dropoffMode || 'school');
  const [customPickup, setCustomPickup] = useState(draft.customPickup || '');
  const [customDropoff, setCustomDropoff] = useState(draft.customDropoff || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setError('');
    setLoading(true);
    try {
      const from = await resolvePickup({
        mode: pickupMode === 'current' ? 'current' : pickupMode === 'custom' ? 'custom' : 'home',
        homeAddress,
        homeCoords: user?.homeCoords,
        customLabel: customPickup || homeAddress,
      });

      const to = await resolveDestination({
        mode: dropoffMode === 'custom' ? 'custom' : 'school',
        schoolName: school,
        customLabel: customDropoff || `${school} · main gate`,
      });

      setBookingDraft({
        pickup: from.label,
        dropoff: to.label,
        pickupCoords: { lng: from.lng, lat: from.lat },
        dropoffCoords: { lng: to.lng, lat: to.lat },
        pickupMode,
        dropoffMode,
        customPickup,
        customDropoff,
        school,
      });
      navigate('/schedule');
    } catch (err) {
      setError(
        err?.message?.includes('denied') || err?.code === 1
          ? 'Location permission denied. Allow location access or choose Home.'
          : err.message || 'Could not resolve locations',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/select-children" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Pick locations</h1>
      <p className="mt-2 text-slate-600">
        Choose where the driver picks up, and where to drop off.
      </p>

      {/* Pickup */}
      <div className="mt-8">
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MapPin size={16} className="text-emerald-600" /> Pickup for driver
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPickupMode('home')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
              pickupMode === 'home'
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <Home size={18} className="text-emerald-600" />
            <span className="text-sm font-semibold text-slate-900">Home</span>
            <span className="line-clamp-2 text-[11px] text-slate-500">{homeAddress}</span>
          </button>
          <button
            type="button"
            onClick={() => setPickupMode('current')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
              pickupMode === 'current'
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <Navigation size={18} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-900">Current location</span>
            <span className="text-[11px] text-slate-500">Use phone GPS for the driver</span>
          </button>
        </div>
        {pickupMode === 'home' && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Driver will navigate to your saved home address.
          </p>
        )}
        {pickupMode === 'current' && (
          <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">
            We&apos;ll capture your live GPS when you confirm (allow location access).
          </p>
        )}
        <button
          type="button"
          onClick={() => setPickupMode('custom')}
          className={`mt-2 w-full rounded-2xl border px-3 py-2 text-left text-sm ${
            pickupMode === 'custom'
              ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-900'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          Or enter a custom pickup address…
        </button>
        {pickupMode === 'custom' && (
          <input
            value={customPickup}
            onChange={(e) => setCustomPickup(e.target.value)}
            placeholder="e.g. 5 Adeola Odeku St, VI"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-emerald-600/30 focus:ring-2"
          />
        )}
      </div>

      {/* Destination */}
      <div className="mt-8">
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MapPin size={16} className="text-blue-600" /> Destination
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDropoffMode('school')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
              dropoffMode === 'school'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <School size={18} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-900">School</span>
            <span className="line-clamp-2 text-[11px] text-slate-500">{school}</span>
          </button>
          <button
            type="button"
            onClick={() => setDropoffMode('custom')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
              dropoffMode === 'custom'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <Map size={18} className="text-slate-600" />
            <span className="text-sm font-semibold text-slate-900">Desired location</span>
            <span className="text-[11px] text-slate-500">Any address you choose</span>
          </button>
        </div>
        {dropoffMode === 'custom' && (
          <input
            value={customDropoff}
            onChange={(e) => setCustomDropoff(e.target.value)}
            placeholder="e.g. After-school club, Ikoyi"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-emerald-600/30 focus:ring-2"
          />
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="button"
        disabled={loading || (pickupMode === 'custom' && !customPickup.trim()) || (dropoffMode === 'custom' && !customDropoff.trim())}
        onClick={confirm}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Resolving locations…' : 'Confirm locations'}
      </button>
    </div>
  );
}
