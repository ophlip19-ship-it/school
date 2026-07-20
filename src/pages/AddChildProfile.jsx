import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImagePlus, X } from 'lucide-react';
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
  const fileRef = useRef(null);
  const existing = user?.children?.[0];

  const [childName, setChildName] = useState(existing?.name || user?.childName || '');
  const [grade, setGrade] = useState(existing?.grade || 'Grade 5');
  const [school, setSchool] = useState(existing?.school || user?.school || 'Greenfield School');
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setChildName(existing.name);
      setGrade(existing.grade || 'Grade 5');
      setSchool(existing.school || 'Greenfield School');
      setPhotoUrl(existing.photoUrl || '');
    }
  }, [existing]);

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

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = {
        name: childName.trim() || 'Alex',
        school: school.trim() || 'Greenfield School',
        grade,
        photoUrl: photoUrl || '',
      };
      if (existing?.id) {
        await childrenApi.update(existing.id, payload);
      } else {
        await childrenApi.create(payload);
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
        Add a photo so drivers can confirm the right child at handover.
      </p>

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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-emerald-500 hover:text-emerald-700"
        >
          <ImagePlus size={16} />
          {photoUrl ? 'Change photo' : 'Add photo'}
        </button>
      </div>

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
