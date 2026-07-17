import { useEffect, useState } from 'react';
import { Users, Zap, TrendingUp, BarChart3, Shield, Activity } from 'lucide-react';
import { adminApi } from '../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .stats()
      .then((data) => {
        setStats(data.stats);
        setRecentActivity(data.recentActivity || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading admin data…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">Live metrics from the SchoolRun API</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white">
          <Users size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-blue-100">Total users</p>
          <p className="mt-1 text-3xl font-bold">{stats.totalUsers}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white">
          <Zap size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-emerald-100">Drivers</p>
          <p className="mt-1 text-3xl font-bold">{stats.activeDrivers}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 p-6 text-white">
          <Activity size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-purple-100">Completed rides</p>
          <p className="mt-1 text-3xl font-bold">{stats.completedRides}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-700 p-6 text-white">
          <TrendingUp size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-amber-100">Revenue (NGN)</p>
          <p className="mt-1 text-3xl font-bold">₦{Number(stats.totalRevenue).toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Parents</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{stats.activeParents}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Children</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">{stats.children}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Open / active rides</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.openRides}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Recent activity</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {recentActivity.map((activity, index) => (
            <div
              key={activity.id}
              className={`flex items-center justify-between p-4 ${
                index !== recentActivity.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <div>
                <p className="font-semibold text-slate-900">{activity.user}</p>
                <p className="text-sm text-slate-600">{activity.action}</p>
              </div>
              <p className="text-xs text-slate-500">{activity.time}</p>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No rides yet.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Users, label: 'Users', color: 'bg-blue-600' },
          { icon: Shield, label: 'Safety', color: 'bg-emerald-600' },
          { icon: BarChart3, label: 'Analytics', color: 'bg-purple-600' },
          { icon: TrendingUp, label: 'Reports', color: 'bg-amber-600' },
        ].map(({ icon: Icon, label, color }) => (
          <button
            key={label}
            type="button"
            className={`flex flex-col items-center gap-2 rounded-2xl p-5 font-semibold text-white ${color}`}
          >
            <Icon size={22} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
