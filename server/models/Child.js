import mongoose from 'mongoose';

function parseLngLat(input) {
  if (!input || typeof input !== 'object') return null;
  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lng, lat };
}

/** Public child shape used by parent, driver, and admin APIs */
export function mapChildPublic(c) {
  if (!c) return null;
  const coords = parseLngLat(c.schoolCoords);
  const school = String(c.school || '').trim();
  const schoolAddress = String(c.schoolAddress || school).trim();
  return {
    id: (c._id || c.id).toString(),
    name: c.name,
    school,
    schoolAddress,
    schoolCoords: coords,
    grade: c.grade,
    photoUrl: c.photoUrl || '',
    createdAt: c.createdAt,
  };
}

const childSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    school: { type: String, default: '' },
    /** Geocoded school address shown on maps */
    schoolAddress: { type: String, default: '' },
    schoolCoords: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
    },
    grade: { type: String, default: 'Grade 5' },
    /** Base64 data URL or remote image URL */
    photoUrl: { type: String, default: '' },
  },
  { timestamps: true },
);

childSchema.methods.toPublic = function toPublic() {
  return mapChildPublic(this);
};

export default mongoose.model('Child', childSchema);
