import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Zap,
  TrendingUp,
  Shield,
  Activity,
  Car,
  UserRound,
  Phone,
  Mail,
  BadgeCheck,
  Ban,
  CheckCircle2,
  X,
  MapPin,
  Baby,
  Loader2,
} from 'lucide-react';
import { adminApi } from '../lib/api';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(value);
  }
}

function StatusBadge({ suspended, verified }) {
  if (suspended) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        <Ban size={12} />
        Suspended
      </span>
    );
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        <BadgeCheck size={12} />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Unverified
    </span>
  );
}

function RideStatusPill({ status }) {
  const styles = {
    completed: 'bg-emerald-100 text-emerald-700',
    open: 'bg-blue-100 text-blue-700',
    requested: 'bg-amber-100 text-amber-800',
    assigned: 'bg-indigo-100 text-indigo-700',
    in_transit: 'bg-purple-100 text-purple-700',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        styles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {(status || '').replace('_', ' ')}
    </span>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // 'overview' | 'drivers' | 'parents'
  const [drivers, setDrivers] = useState([]);
  const [parents, setParents] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    adminApi
      .stats()
      .then((data) => {
        setStats(data.stats);
        setRecentActivity(data.recentActivity || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  const loadUsers = useCallback(async (role, { silent = false } = {}) => {
    if (!silent) {
      setListLoading(true);
      setListError('');
    }
    try {
      const data = await adminApi.users(role);
      if (role === 'driver') setDrivers(data.users || []);
      else setParents(data.users || []);
    } catch (err) {
      if (!silent) setListError(err.message);
    } finally {
      if (!silent) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'drivers') loadUsers('driver');
    if (tab === 'parents') loadUsers('parent');
  }, [tab, loadUsers]);

  const openUserDetail = async (id) => {
    setDetailLoading(true);
    setActionMessage('');
    setSelectedUser(null);
    try {
      const data = await adminApi.user(id);
      setSelectedUser(data.user);
    } catch (err) {
      setListError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshListsAndStats = async () => {
    await Promise.all([
      loadUsers('driver', { silent: true }),
      loadUsers('parent', { silent: true }),
      adminApi.stats().then((data) => {
        setStats(data.stats);
        setRecentActivity(data.recentActivity || []);
      }),
    ]);
  };

  const handleSuspend = async (driverId) => {
    if (!window.confirm('Suspend this driver? They will not be able to log in or accept rides.')) {
      return;
    }
    setActionLoading(true);
    setActionMessage('');
    try {
      await adminApi.suspendDriver(driverId);
      setActionMessage('Driver suspended.');
      const data = await adminApi.user(driverId);
      setSelectedUser(data.user);
      await refreshListsAndStats();
    } catch (err) {
      setActionMessage(err.message || 'Failed to suspend driver');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async (driverId) => {
    if (!window.confirm('Reinstate this driver?')) return;
    setActionLoading(true);
    setActionMessage('');
    try {
      await adminApi.unsuspendDriver(driverId);
      setActionMessage('Driver reinstated.');
      const data = await adminApi.user(driverId);
      setSelectedUser(data.user);
      await refreshListsAndStats();
    } catch (err) {
      setActionMessage(err.message || 'Failed to reinstate driver');
    } finally {
      setActionLoading(false);
    }
  };

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

  const list = tab === 'drivers' ? drivers : parents;

  return (
    <div className="mx-auto max-w-6xl p-6 pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">
          Live metrics, user management, and driver controls
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white">
          <Users size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-blue-100">Total users</p>
          <p className="mt-1 text-3xl font-bold">{stats.totalUsers}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white">
          <Zap size={24} className="opacity-80" />
          <p className="mt-3 text-sm text-emerald-100">Active drivers</p>
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
          <p className="mt-1 text-3xl font-bold">
            ₦{Number(stats.totalRevenue).toLocaleString()}
          </p>
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

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'drivers', label: 'Drivers', icon: Car },
          { id: 'parents', label: 'Parents', icon: UserRound },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
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

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              {
                icon: Car,
                label: 'Drivers',
                color: 'bg-emerald-600',
                onClick: () => setTab('drivers'),
              },
              {
                icon: UserRound,
                label: 'Parents',
                color: 'bg-blue-600',
                onClick: () => setTab('parents'),
              },
              { icon: Shield, label: 'Safety', color: 'bg-slate-600', onClick: undefined },
              { icon: TrendingUp, label: 'Reports', color: 'bg-amber-600', onClick: undefined },
            ].map(({ icon: Icon, label, color, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                disabled={!onClick}
                className={`flex flex-col items-center gap-2 rounded-2xl p-5 font-semibold text-white ${color} ${
                  onClick ? 'hover:opacity-90' : 'cursor-default opacity-80'
                }`}
              >
                <Icon size={22} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drivers / Parents lists */}
      {(tab === 'drivers' || tab === 'parents') && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              {tab === 'drivers' ? 'Drivers' : 'Parents'}
            </h2>
            <button
              type="button"
              onClick={() => loadUsers(tab === 'drivers' ? 'driver' : 'parent')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {listError && (
            <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {listError}
            </p>
          )}

          {listLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500">
              <Loader2 className="animate-spin" size={20} />
              Loading {tab}…
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              No {tab} found.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-12 sm:gap-3">
                <div className="sm:col-span-4">Name</div>
                <div className="sm:col-span-3">Contact</div>
                <div className="sm:col-span-2">
                  {tab === 'drivers' ? 'Vehicle' : 'Children'}
                </div>
                <div className="sm:col-span-2">Rides</div>
                <div className="sm:col-span-1">Status</div>
              </div>
              {list.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => openUserDetail(user.id)}
                  className={`w-full text-left transition hover:bg-slate-50 ${
                    index !== list.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <div className="grid gap-2 p-4 sm:grid-cols-12 sm:items-center sm:gap-3">
                    <div className="sm:col-span-4">
                      <p className="font-semibold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500 sm:hidden">{user.email}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                    <div className="hidden text-sm text-slate-600 sm:col-span-3 sm:block">
                      <p className="truncate">{user.email}</p>
                      <p className="text-xs text-slate-500">{user.phone || 'No phone'}</p>
                    </div>
                    <div className="text-sm text-slate-700 sm:col-span-2">
                      {tab === 'drivers' ? (
                        <span className="font-medium">{user.vehiclePlate || '—'}</span>
                      ) : (
                        <span>
                          {user.childrenCount ?? user.children?.length ?? 0} child
                          {(user.childrenCount ?? user.children?.length ?? 0) === 1
                            ? ''
                            : 'ren'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-700 sm:col-span-2">
                      <span className="font-medium">{user.totalRides ?? 0}</span>
                      <span className="text-slate-400"> total</span>
                      {(user.activeRides ?? 0) > 0 && (
                        <span className="ml-1 text-xs text-emerald-600">
                          · {user.activeRides} active
                        </span>
                      )}
                    </div>
                    <div className="sm:col-span-1">
                      <StatusBadge suspended={user.suspended} verified={user.verified} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail drawer / modal */}
      {(selectedUser || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => {
              setSelectedUser(null);
              setActionMessage('');
            }}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            {detailLoading && !selectedUser ? (
              <div className="flex items-center justify-center gap-2 p-16 text-slate-500">
                <Loader2 className="animate-spin" size={22} />
                Loading details…
              </div>
            ) : selectedUser ? (
              <>
                <div className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {selectedUser.role === 'driver' ? 'Driver' : 'Parent'} details
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedUser.name}
                    </h3>
                    <div className="mt-2">
                      <StatusBadge
                        suspended={selectedUser.suspended}
                        verified={selectedUser.verified}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setActionMessage('');
                    }}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6 px-6 py-5">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <Mail size={16} className="shrink-0 text-slate-400" />
                      <span className="break-all">{selectedUser.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <Phone size={16} className="shrink-0 text-slate-400" />
                      <span>{selectedUser.phone || 'No phone on file'}</span>
                    </div>
                    {selectedUser.role === 'driver' && (
                      <div className="flex items-center gap-3 text-sm text-slate-700">
                        <Car size={16} className="shrink-0 text-slate-400" />
                        <span>{selectedUser.vehiclePlate || 'No plate registered'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <Users size={16} className="shrink-0 text-slate-400" />
                      <span>Joined {formatDate(selectedUser.createdAt)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">Total rides</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        {selectedUser.totalRides ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3 text-center">
                      <p className="text-xs text-emerald-700">Completed</p>
                      <p className="mt-1 text-xl font-bold text-emerald-800">
                        {selectedUser.completedRides ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3 text-center">
                      <p className="text-xs text-blue-700">Active</p>
                      <p className="mt-1 text-xl font-bold text-blue-800">
                        {selectedUser.activeRides ?? 0}
                      </p>
                    </div>
                  </div>

                  {selectedUser.role === 'parent' && selectedUser.children?.length > 0 && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Baby size={16} />
                        Children
                      </h4>
                      <div className="space-y-2">
                        {selectedUser.children.map((child) => (
                          <div
                            key={child.id}
                            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                          >
                            <p className="font-medium text-slate-900">{child.name}</p>
                            <p className="text-xs text-slate-500">
                              {child.school}
                              {child.grade ? ` · ${child.grade}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser.recentRides?.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-slate-900">
                        Recent rides
                      </h4>
                      <div className="space-y-2">
                        {selectedUser.recentRides.map((ride) => (
                          <div
                            key={ride.id}
                            className="rounded-xl border border-slate-100 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-slate-900">{ride.childName}</p>
                              <RideStatusPill status={ride.status} />
                            </div>
                            <p className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                              <MapPin size={12} className="mt-0.5 shrink-0" />
                              <span>
                                {ride.pickup} → {ride.dropoff}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {ride.date} · {ride.time}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser.role === 'driver' && (
                    <div className="border-t border-slate-100 pt-4">
                      {actionMessage && (
                        <p
                          className={`mb-3 rounded-xl px-3 py-2 text-sm ${
                            actionMessage.toLowerCase().includes('fail')
                              ? 'bg-red-50 text-red-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {actionMessage}
                        </p>
                      )}
                      {selectedUser.suspended ? (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleUnsuspend(selectedUser.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {actionLoading ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <CheckCircle2 size={18} />
                          )}
                          Reinstate driver
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleSuspend(selectedUser.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                        >
                          {actionLoading ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <Ban size={18} />
                          )}
                          Suspend driver
                        </button>
                      )}
                      <p className="mt-2 text-center text-xs text-slate-500">
                        Suspended drivers cannot log in or accept new rides.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
