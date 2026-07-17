import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { childrenApi } from '../lib/api';

export default function AddChildProfile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const existing = user?.children?.[0];

  const [childName, setChildName] = useState(existing?.name || user?.childName || '');
  const [grade, setGrade] = useState(existing?.grade || 'Grade 5');
  const [school, setSchool] = useState(existing?.school || user?.school || 'Greenfield School');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setChildName(existing.name);
      setGrade(existing.grade || 'Grade 5');
      setSchool(existing.school || 'Greenfield School');
    }
  }, [existing]);

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      if (existing?.id) {
        await childrenApi.update(existing.id, {
          name: childName.trim() || 'Alex',
          school: school.trim() || 'Greenfield School',
          grade,
        });
      } else {
        await childrenApi.create({
          name: childName.trim() || 'Alex',
          school: school.trim() || 'Greenfield School',
          grade,
        });
      }
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to save child');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">
        {existing ? 'Edit child profile' : 'Add child profile'}
      </h1>
      <p className="mt-2 text-slate-600">
        Saved to the SchoolRun API for pickups, handovers, and tracking.
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Child name</label>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">School</label>
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Grade / class</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          >
            {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'JSS 1', 'JSS 2', 'JSS 3'].map(
              (g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? 'Saving…' : 'Save profile'}
      </button>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="mt-3 w-full py-3 text-sm font-medium text-slate-500"
      >
        Skip for now
      </button>
    </div>
  );
}
