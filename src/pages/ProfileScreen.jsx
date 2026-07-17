import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Mail, Phone, Shield, User } from 'lucide-react';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const roleLabel =
    user?.role === 'driver' ? 'Verified driver' : user?.role === 'admin' ? 'Admin' : 'Verified parent';

  return (
    <div className="mx-auto max-w-md p-6 pb-32">
      <h1 className="text-3xl font-bold text-slate-900">Profile</h1>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          {user?.role === 'driver' ? '🚗' : user?.role === 'admin' ? '🛡️' : '👤'}
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">{user?.name}</h2>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
          <Shield size={14} /> {roleLabel}
        </p>
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <Mail size={18} className="text-slate-400" />
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="font-medium text-slate-900">{user?.email || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-2 py-2">
          <Phone size={18} className="text-slate-400" />
          <div>
            <p className="text-xs text-slate-500">Phone</p>
            <p className="font-medium text-slate-900">{user?.phone || '—'}</p>
          </div>
        </div>
        {user?.role === 'parent' && (
          <div className="flex items-center gap-3 px-2 py-2">
            <User size={18} className="text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Children</p>
              <p className="font-medium text-slate-900">
                {(user?.children || []).map((c) => c.name).join(', ') || user?.childName || '—'}
              </p>
            </div>
          </div>
        )}
        {user?.role === 'driver' && (
          <div className="flex items-center gap-3 px-2 py-2">
            <User size={18} className="text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Vehicle</p>
              <p className="font-medium text-slate-900">{user?.vehiclePlate || '—'}</p>
            </div>
          </div>
        )}
      </div>

      {user?.role === 'parent' && (
        <Link
          to="/add-child"
          className="mt-4 block rounded-2xl border border-slate-200 bg-white py-3.5 text-center font-semibold text-slate-800"
        >
          Edit child profile
        </Link>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3.5 font-semibold text-red-600 transition hover:bg-red-100"
      >
        <LogOut size={18} /> Log out
      </button>
    </div>
  );
}
