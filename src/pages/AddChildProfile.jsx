import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, ImagePlus, X, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { childrenApi } from '../lib/api';

const MAX_FILE_BYTES = 450_000;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

/** Downscale large photos so they fit Mongo document limits */
async function compressImage(file, maxEdge = 480, quality = 0.72) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }
  if (file.size <= MAX_FILE_BYTES && file.size < 120_000) {
    return readFileAsDataUrl(file);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export default function AddChildProfile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id') || '';

  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  const children = user?.children || [];
  const existing = editId
    ? children.find((c) => c.id === editId) || null
    : null;
  const isEdit = Boolean(existing);

  const [childName, setChildName] = useState('');
  const [grade, setGrade] = useState('Grade 5');
  const [school, setSchool] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedChildId, setSavedChildId] = useState(null);

  // Load edit target or blank form for a new child (keyed by editId only)
  useEffect(() => {
    if (editId) {
      const target = (user?.children || []).find((c) => c.id === editId);
      if (target) {
        setChildName(target.name || '');
        setGrade(target.grade || 'Grade 5');
        setSchool(target.school || '');
        setPhotoUrl(target.photoUrl || '');
      }
      setSavedChildId(null);
      return;
    }
    // New child — blank form (do not prefill from first child)
    setChildName('');
    setGrade('Grade 5');
    setSchool(user?.school || user?.children?.[0]?.school || '');
    setPhotoUrl('');
    setSavedChildId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init when switching child id / new form
  }, [editId, user?.children, user?.school]);

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const url = await compressImage(file);
      if (url.length > 900_000) {
        throw new Error('Photo is still too large. Try a smaller image.');
      }
      setPhotoUrl(url);
    } catch (err) {
      setError(err.message || 'Failed to process photo');
    }
  };

  const handleSave = async ({ addAnother = false } = {}) => {
    setError('');
    if (!childName.trim()) {
      setError('Child name is required');
      return;
    }
    if (!school.trim()) {
      setError('School is required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: childName.trim(),
        school: school.trim(),
        grade,
        photoUrl: photoUrl || '',
      };
      let child;
      if (isEdit && existing?.id) {
        const res = await childrenApi.update(existing.id, payload);
        child = res.child;
      } else {
        const res = await childrenApi.create(payload);
        child = res.child;
      }
      await refreshUser();
      setSavedChildId(child?.id || existing?.id || null);

      if (addAnother) {
        // Reset for another new child
        navigate('/add-child', { replace: true });
        setChildName('');
        setGrade('Grade 5');
        setSchool(payload.school);
        setPhotoUrl('');
        setSavedChildId(null);
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to save child');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-8 sm:px-6 sm:py-10 md:max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {isEdit ? 'Edit child profile' : 'Add child profile'}
      </h1>
      <p className="mt-2 text-slate-600">
        {isEdit
          ? 'Update this child’s details and photo for driver handover.'
          : 'You can add more than one child. Each profile has its own photo and school.'}
      </p>

      {children.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Users size={12} /> Your children ({children.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                to={`/add-child?id=${c.id}`}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                  editId === c.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                }`}
              >
                {c.photoUrl ? (
                  <img
                    src={c.photoUrl}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : null}
                {c.name}
              </Link>
            ))}
            <Link
              to="/add-child"
              className="inline-flex items-center rounded-full border border-dashed border-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-700"
            >
              + New
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center">
        <div className="relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Child"
              className="h-28 w-28 rounded-3xl object-cover shadow-md ring-4 ring-emerald-100"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 ring-4 ring-slate-50">
              <Camera size={36} />
            </div>
          )}
          {photoUrl && (
            <button
              type="button"
              onClick={() => setPhotoUrl('')}
              className="absolute -right-2 -top-2 rounded-full bg-slate-900 p-1.5 text-white shadow"
              aria-label="Remove photo"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Gallery (device album) — no capture attribute */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickPhoto}
        />
        {/* Camera — capture prompts device camera on mobile */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />

        <div className="mt-4 flex w-full max-w-xs gap-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-emerald-500 hover:text-emerald-700"
          >
            <ImagePlus size={16} />
            Album
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-emerald-500 hover:text-emerald-700"
          >
            <Camera size={16} />
            Camera
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">
          Choose from your device album or take a new photo with the camera.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Child name</label>
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g. Alex"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">School</label>
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="e.g. Grange School, Ikeja"
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
      {savedChildId && !error && (
        <p className="mt-4 text-sm text-emerald-700">Child saved.</p>
      )}

      <button
        type="button"
        onClick={() => handleSave({ addAnother: false })}
        disabled={loading}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Save child'}
      </button>

      {!isEdit && (
        <button
          type="button"
          onClick={() => handleSave({ addAnother: true })}
          disabled={loading}
          className="mt-3 w-full rounded-2xl border border-emerald-600 bg-white py-3.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
        >
          Save &amp; add another child
        </button>
      )}

      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="mt-3 w-full py-3 text-sm font-medium text-slate-500"
      >
        {isEdit ? 'Cancel' : 'Skip for now'}
      </button>
    </div>
  );
}
