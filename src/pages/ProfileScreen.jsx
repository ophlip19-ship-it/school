import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AddressSearchInput from '../components/AddressSearchInput';
import PageShell from '../components/PageShell';
import {
  LogOut,
  Mail,
  Phone,
  Shield,
  User,
  Home,
  Pencil,
  Lock,
  X,
  Check,
  Eye,
  EyeOff,
  Car,
} from 'lucide-react';

export default function ProfileScreen() {
  const { user, logout, confirmIdentity, updateUser } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [homeCoords, setHomeCoords] = useState(null);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [savePassword, setSavePassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setPhone(user.phone || '');
    setHomeAddress(user.homeAddress || '');
    setHomeCoords(user.homeCoords || null);
    setVehiclePlate(user.vehiclePlate || '');
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const roleLabel =
    user?.role === 'driver'
      ? 'Verified driver'
      : user?.role === 'admin'
        ? 'Admin'
        : 'Verified parent';

  const isParent = user?.role === 'parent';
  const isDriver = user?.role === 'driver';

  const resetFormFromUser = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setHomeAddress(user?.homeAddress || '');
    setHomeCoords(user?.homeCoords || null);
    setVehiclePlate(user?.vehiclePlate || '');
    setSaveError('');
    setSaveSuccess('');
    setSavePassword('');
  };

  const startEdit = () => {
    resetFormFromUser();
    setVerified(false);
    setPassword('');
    setVerifyError('');
    setShowVerifyModal(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setVerified(false);
    setShowVerifyModal(false);
    resetFormFromUser();
  };

  const handleConfirmIdentity = async (e) => {
    e?.preventDefault?.();
    if (!password.trim()) {
      setVerifyError('Enter your account password to continue.');
      return;
    }
    setVerifyLoading(true);
    setVerifyError('');
    try {
      await confirmIdentity(password);
      setVerified(true);
      setEditing(true);
      setShowVerifyModal(false);
      setSavePassword(password);
      setPassword('');
    } catch (err) {
      setVerifyError(err.message || 'Could not verify identity');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!verified) {
      setSaveError('Verify your identity before saving changes.');
      return;
    }
    if (!name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    if (!savePassword) {
      setSaveError('Re-enter your password to save changes.');
      return;
    }

    setSaveLoading(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const payload = {
        currentPassword: savePassword,
        name: name.trim(),
        phone: phone.trim(),
      };
      if (isParent) {
        payload.homeAddress = homeAddress.trim();
        payload.homeCoords = homeCoords;
      }
      if (isDriver) {
        payload.vehiclePlate = vehiclePlate.trim();
      }
      await updateUser(payload);
      setSaveSuccess('Profile updated successfully.');
      setEditing(false);
      setVerified(false);
      setSavePassword('');
    } catch (err) {
      setSaveError(err.message || 'Could not save profile');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <PageShell width="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your account details
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Pencil size={16} /> Edit profile
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <X size={16} /> Cancel
          </button>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:mt-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          {user?.role === 'driver'
            ? '🚗'
            : user?.role === 'admin'
              ? '🛡️'
              : '👤'}
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">
          {user?.name}
        </h2>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
          <Shield size={14} /> {roleLabel}
        </p>
      </div>

      {!editing ? (
        <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <InfoRow icon={Mail} label="Email" value={user?.email || '—'} />
          <InfoRow icon={Phone} label="Phone" value={user?.phone || '—'} />
          {isParent && (
            <InfoRow
              icon={Home}
              label="Home address"
              value={user?.homeAddress || 'Not set — tap Edit to add'}
            />
          )}
          {isParent && (
            <InfoRow
              icon={User}
              label={`Children (${(user?.children || []).length || (user?.childName ? 1 : 0)})`}
              value={
                (user?.children || []).map((c) => c.name).join(', ') ||
                user?.childName ||
                '—'
              }
            />
          )}
          {isDriver && (
            <InfoRow
              icon={Car}
              label="Vehicle"
              value={user?.vehiclePlate || '—'}
            />
          )}
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <p>
              Identity verified. Update your details below, then confirm with
              your password to save.
            </p>
          </div>

          <Field label="Full name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none ring-emerald-600/30 focus:bg-white focus:ring-2"
              required
              autoComplete="name"
            />
          </Field>

          <Field label="Email (cannot change)">
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-slate-100 bg-slate-100 px-3 py-2.5 text-slate-500"
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none ring-emerald-600/30 focus:bg-white focus:ring-2"
              autoComplete="tel"
            />
          </Field>

          {isParent && (
            <Field label="Home address">
              <AddressSearchInput
                value={homeAddress}
                onChange={(v) => {
                  setHomeAddress(v);
                  setHomeCoords(null);
                }}
                onSelect={(place) => {
                  setHomeAddress(place.label);
                  setHomeCoords({ lng: place.lng, lat: place.lat });
                }}
                placeholder="Search your home address…"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Used as the default pickup location for instant rides.
              </p>
            </Field>
          )}

          {isDriver && (
            <Field label="Vehicle plate">
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none ring-emerald-600/30 focus:bg-white focus:ring-2"
              />
            </Field>
          )}

          <Field label="Confirm password to save">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={savePassword}
                onChange={(e) => setSavePassword(e.target.value)}
                placeholder="Your account password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 outline-none ring-emerald-600/30 focus:bg-white focus:ring-2"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          {saveError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {saveSuccess}
            </p>
          )}

          <button
            type="submit"
            disabled={saveLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <Check size={18} />
            {saveLoading ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      {saveSuccess && !editing && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saveSuccess}
        </p>
      )}

      {isParent && (
        <div className="mt-4 space-y-2">
          {(user?.children || []).map((child) => (
            <Link
              key={child.id}
              to={`/add-child?id=${child.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800"
            >
              {child.photoUrl ? (
                <img
                  src={child.photoUrl}
                  alt=""
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700">
                  {(child.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate">Edit {child.name}</span>
              <span className="text-xs font-medium text-emerald-600">Edit</span>
            </Link>
          ))}
          <Link
            to="/add-child"
            className="block rounded-2xl border border-dashed border-emerald-400 bg-emerald-50 py-3.5 text-center font-semibold text-emerald-700"
          >
            + Add another child
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3.5 font-semibold text-red-600 transition hover:bg-red-100"
      >
        <LogOut size={18} /> Log out
      </button>

      {/* Identity verification modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => {
              setShowVerifyModal(false);
              setPassword('');
              setVerifyError('');
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Lock size={22} />
            </div>
            <h3 className="text-center text-xl font-bold text-slate-900">
              Verify it&apos;s you
            </h3>
            <p className="mt-2 text-center text-sm text-slate-600">
              Enter your password before editing profile details
              {isParent ? ' or home address' : ''}.
            </p>

            <form onSubmit={handleConfirmIdentity} className="mt-6 space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Account password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 pr-11 outline-none ring-emerald-600/30 focus:bg-white focus:ring-2"
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {verifyError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {verifyError}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setShowVerifyModal(false);
                    setPassword('');
                    setVerifyError('');
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyLoading}
                  className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {verifyLoading ? 'Checking…' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 px-2 py-2">
      <Icon size={18} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-words font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
