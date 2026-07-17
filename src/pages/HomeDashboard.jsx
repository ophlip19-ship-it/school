import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  AlertCircle,
  Plus,
  ChevronRight,
  History,
  User,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi, formatMoney } from '../lib/api';

export default function HomeDashboard() {
  const { user } = useAuth();
  const [activeRide, setActiveRide] = useState(null);
  const [rides, setRides] = useState([]);

  useEffect(() => {
    ridesApi.active().then(({ ride }) => setActiveRide(ride)).catch(() => {});
    ridesApi.list().then(({ rides: list }) => setRides(list.slice(0, 5))).catch(() => {});
  }, []);

  const childName = user?.childName || user?.children?.[0]?.name || 'your child';
  const school = user?.school || user?.children?.[0]?.school || 'School';

  return (
    <div className="mx-auto max-w-lg p-6 pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome back, {user?.name || user?.parentName || 'Parent'}
        </h1>
        <p className="mt-2 text-slate-600">Live data from the SchoolRun API</p>
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
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="font-semibold text-slate-900">No active trip</p>
          <p className="mt-1 text-sm text-slate-600">Book a ride for {childName}</p>
          <Link
            to="/select-children"
            className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Book a ride
          </Link>
        </div>
      )}

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
          {(user?.children || []).map((child) => (
            <div
              key={child.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="font-semibold text-slate-900">{child.name}</h3>
              <p className="text-sm text-slate-600">
                {child.school} · {child.grade}
              </p>
            </div>
          ))}
          {(!user?.children || user.children.length === 0) && (
            <p className="text-sm text-slate-500">No children yet — add one to book rides.</p>
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
        <Link
          to="/select-children"
          className="rounded-2xl border-2 border-slate-200 bg-white p-5 transition hover:border-emerald-500 hover:bg-emerald-50"
        >
          <h3 className="font-semibold text-slate-900">Book a ride</h3>
          <p className="mt-1 text-sm text-slate-600">Schedule &amp; pay</p>
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
          className="col-span-2 rounded-2xl border-2 border-slate-200 bg-white p-5 transition hover:border-emerald-500 hover:bg-emerald-50"
        >
          <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <User size={18} /> Profile &amp; settings
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
