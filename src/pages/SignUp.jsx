import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AddressSearchInput from '../components/AddressSearchInput';
import { forwardGeocode } from '../lib/geo';

const ROLES = [
  { id: 'parent', label: 'Parent', hint: 'Book & track rides' },
  { id: 'driver', label: 'Driver', hint: 'Accept school trips' },
  { id: 'admin', label: 'Admin', hint: 'Manage the network' },
];

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.1 5.5A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.1 17.1 0 0 1-4.4 5.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 6.2A16.8 16.8 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 5.3-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SignUp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { registerUser, login } = useAuth();
  const mode = params.get('mode') === 'login' ? 'login' : 'register';

  const initialRole = ROLES.some((r) => r.id === params.get('role'))
    ? params.get('role')
    : 'parent';

  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    homeAddress: '',
    vehiclePlate: '',
  });
  const [homeCoords, setHomeCoords] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'login') {
      setLoading(true);
      try {
        const user = await login({ email: form.email, password: form.password });
        navigate(
          user.role === 'driver' ? '/driver' : user.role === 'admin' ? '/admin' : '/dashboard',
        );
      } catch (err) {
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }

    if (role === 'parent' && !form.homeAddress.trim()) {
      setError('Home address is required. Search and pick your address from the list.');
      return;
    }

    setLoading(true);
    try {
      let coords = homeCoords;
      let resolvedHome = form.homeAddress.trim();
      if (role === 'parent' && !coords) {
        const geo = await forwardGeocode(resolvedHome);
        if (!geo) {
          setError('Could not place that home address on the map. Pick a suggestion from the list.');
          setLoading(false);
          return;
        }
        coords = { lng: geo.lng, lat: geo.lat };
        if (geo.label) resolvedHome = geo.label;
      }

      const user = await registerUser({
        role,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        vehiclePlate: form.vehiclePlate.trim(),
        homeAddress: role === 'parent' ? resolvedHome : '',
        homeCoords: role === 'parent' ? coords : null,
      });

      if (user.role === 'parent') navigate('/verify');
      else if (user.role === 'driver') navigate('/driver');
      else navigate('/admin');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-8 sm:px-6 sm:py-10 md:max-w-lg">
      <Link to="/" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </h1>
      <p className="mt-2 text-slate-600">
        {mode === 'login' ? 'Sign in to SchoolRun' : 'Join SchoolRun — powered by a live API'}
      </p>

      {mode === 'register' && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                role === r.id
                  ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{r.label}</p>
              <p className="mt-1 text-[11px] text-slate-500">{r.hint}</p>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {mode === 'register' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={onChange}
            placeholder="you@email.com"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={onChange}
              placeholder="Min 6 characters"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-12 outline-none ring-emerald-600/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-3 flex items-center justify-center text-slate-500 transition hover:text-slate-700"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        {mode === 'register' && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
              <input
                name="phone"
                value={form.phone}
                onChange={onChange}
                placeholder="+234 800 000 0000"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
              />
            </div>
            {role === 'parent' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Home address
                </label>
                <AddressSearchInput
                  value={form.homeAddress}
                  onChange={(v) => {
                    setForm((prev) => ({ ...prev, homeAddress: v }));
                    setHomeCoords(null);
                  }}
                  onSelect={(place) => {
                    setForm((prev) => ({ ...prev, homeAddress: place.label }));
                    setHomeCoords({ lng: place.lng, lat: place.lat });
                  }}
                  placeholder="Search your home address…"
                />
                {homeCoords ? (
                  <p className="mt-1.5 text-xs text-emerald-700">
                    Saved on the map · pickup pin during booking
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Pick a suggestion so drivers get a live map pin. 
                  </p>
                )}
              </div>
            )}
            {role === 'driver' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Vehicle plate
                </label>
                <input
                  name="vehiclePlate"
                  value={form.vehiclePlate}
                  onChange={onChange}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
                />
              </div>
            )}
          </>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Continue'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {mode === 'login' ? (
          <>
            New here?{' '}
            <Link to="/signup" className="font-semibold text-emerald-600">
              Create account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link to="/signup?mode=login" className="font-semibold text-emerald-600">
              Sign in
            </Link>
          </>
        )}
      </p>

      
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Demo logins (password: password123)</p>
        <p className="mt-1">parent@schoolrun.app · driver@schoolrun.app · admin@schoolrun.app</p>
      </div>
    </div>
  );
}
