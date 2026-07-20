import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { childrenApi } from '../lib/api';
import { setBookingDraft } from '../lib/booking';

export default function SelectChildren() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    childrenApi
      .list()
      .then(({ children: list }) => {
        setChildren(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const continueNext = () => {
    const child = children.find((c) => c.id === selected);
    if (!child) {
      setError('Select a child to continue');
      return;
    }
    setBookingDraft({ childId: child.id, childName: child.name, school: child.school });
    navigate('/pick-locations');
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/dashboard" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Select children</h1>
      <p className="mt-2 text-slate-600">Who is riding today?</p>

      {loading && <p className="mt-8 text-slate-500">Loading…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 space-y-3">
        {children.map((child) => (
          <label
            key={child.id}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition ${
              selected === child.id
                ? 'border-emerald-600 ring-2 ring-emerald-600/20'
                : 'border-slate-200'
            }`}
          >
            {child.photoUrl ? (
              <img
                src={child.photoUrl}
                alt={child.name}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-bold text-emerald-700">
                {(child.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-slate-900">{child.name}</p>
              <p className="text-sm text-slate-500">
                {child.school} · {child.grade}
              </p>
            </div>
            <input
              type="radio"
              name="child"
              checked={selected === child.id}
              onChange={() => setSelected(child.id)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>
        ))}
        {!loading && children.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-slate-600">No children on your account yet.</p>
            <Link to="/add-child" className="mt-3 inline-block font-semibold text-emerald-600">
              Add a child
            </Link>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={continueNext}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}
