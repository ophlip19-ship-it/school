import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyAccount() {
  const { user, verifyAccount } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 3) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleVerify = async () => {
    const joined = code.join('');
    if (joined && joined.length !== 4) {
      setError('Enter the 4-digit code from your SMS.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await verifyAccount();
      navigate('/add-child');
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Verify account</h1>
      <p className="mt-2 text-slate-600">
        Welcome{user?.name ? `, ${user.name}` : ''}. Enter the code we sent to{' '}
        <span className="font-medium text-slate-800">{user?.email || 'your email'}</span>.
      </p>

      <div className="mt-10 flex justify-center gap-3">
        {code.map((digit, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            className="h-14 w-14 rounded-2xl border border-slate-200 bg-white text-center text-2xl font-bold outline-none ring-emerald-600/30 focus:ring-2"
          />
        ))}
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      <p className="mt-6 text-center text-sm text-slate-500">
        Demo: any 4-digit code works, or leave blank and continue.
      </p>

      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="mt-8 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? 'Verifying…' : 'Verify & Continue'}
      </button>
    </div>
  );
}
