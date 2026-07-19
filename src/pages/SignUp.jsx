import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { id: 'parent', label: 'Parent', hint: 'Book & track rides' },
  { id: 'driver', label: 'Driver', hint: 'Accept school trips' },
  { id: 'admin', label: 'Admin', hint: 'Manage the network' },
];

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
    childName: '',
    school: 'Greenfield School',
    vehiclePlate: '56A-902-LGS',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await login({ email: form.email, password: form.password });
        navigate(
          user.role === 'driver' ? '/driver' : user.role === 'admin' ? '/admin' : '/dashboard',
        );
        return;
      }

      if (!form.name.trim() || !form.email.trim() || !form.password) {
        setError('Name, email, and password are required.');
        return;
      }

      const user = await registerUser({
        role,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        childName: form.childName.trim() || 'Alex',
        school: form.school.trim() || 'Greenfield School',
        vehiclePlate: form.vehiclePlate.trim(),
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
    <div className="mx-auto min-h-screen max-w-md px-6 py-10">
      <Link to="/" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">
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
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={onChange}
            placeholder="Min 6 characters"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
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
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Child&apos;s name
                  </label>
                  <input
                    name="childName"
                    value={form.childName}
                    onChange={onChange}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">School</label>
                  <input
                    name="school"
                    value={form.school}
                    onChange={onChange}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
                  />
                </div>
              </>
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
       <p className='flex flex-rol justify-between'>
        <button onClick={()=> navigate('/verify')} className="font-bold text-4xl text-red-500">parent</button>
       <button onClick={()=> navigate('/driver')} className="font-bold text-4xl text-red-500">driver</button>
       <button onClick={()=> navigate('/admin')} className="font-bold text-4xl text-red-500">admin</button></p>
        <p className="font-semibold text-slate-800">Demo logins (password: password123)</p>
        <p className="mt-1">parent@schoolrun.app · driver@schoolrun.app · admin@schoolrun.app</p>
      </div>
    </div>
  );
}
