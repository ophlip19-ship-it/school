import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { getBookingDraft, setBookingDraft } from '../lib/booking';

export default function PickLocations() {
  const navigate = useNavigate();
  const draft = getBookingDraft();
  const school = draft.school || 'Greenfield School';
  const [pickup, setPickup] = useState(draft.pickup || 'Home · 12 Admiralty Way, Lekki');
  const [dropoff, setDropoff] = useState(draft.dropoff || `${school} · Victoria Island`);

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/select-children" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Pick locations</h1>
      <p className="mt-2 text-slate-600">Confirm pickup and drop-off points.</p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
            <MapPin size={16} className="text-emerald-600" /> Pickup
          </label>
          <input
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
            <MapPin size={16} className="text-blue-600" /> Drop-off
          </label>
          <input
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setBookingDraft({ pickup, dropoff });
          navigate('/schedule');
        }}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700"
      >
        Confirm locations
      </button>
    </div>
  );
}
