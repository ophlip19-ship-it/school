import { Router } from 'express';
import Child, { mapChildPublic } from '../models/Child.js';
import Ride from '../models/Ride.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('parent'));

function parseLngLat(input) {
  if (!input || typeof input !== 'object') return null;
  const lng = Number(input.lng);
  const lat = Number(input.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lng, lat };
}

function coordsClose(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.lng - b.lng) < 1e-4 && Math.abs(a.lat - b.lat) < 1e-4;
}

function labelLooksLikeSchool(label, schoolName) {
  const text = String(label || '').toLowerCase();
  const name = String(schoolName || '').trim().toLowerCase();
  if (name && text.includes(name)) return true;
  return text.includes('school') || text.includes('main gate');
}

function endMatchesOldSchool(label, coords, prevCoords, prevName, schoolName) {
  const pin = parseLngLat(coords);
  if (coordsClose(pin, prevCoords)) return true;
  if (
    prevName &&
    String(label || '')
      .toLowerCase()
      .includes(prevName.toLowerCase())
  ) {
    return true;
  }
  if (!prevCoords && labelLooksLikeSchool(label, schoolName || prevName)) {
    return true;
  }
  return false;
}

/**
 * Keep upcoming rides' school endpoint in sync when the child's school pin
 * changes — both drop-off (home → school) and pickup (school → home).
 */
async function syncUpcomingSchoolPins(child, previous) {
  const nextCoords = parseLngLat(child.schoolCoords);
  if (!nextCoords) return;

  const nextLabel = String(
    child.schoolAddress || child.school || 'School',
  ).trim();
  const prevCoords = parseLngLat(previous?.schoolCoords);
  const prevName = String(
    previous?.schoolAddress || previous?.school || '',
  ).trim();
  const schoolName = child.school || prevName;

  const rides = await Ride.find({
    childId: child._id,
    status: { $in: ['pending_payment', 'open', 'requested', 'assigned'] },
  });

  for (const ride of rides) {
    const dropMatches = endMatchesOldSchool(
      ride.dropoff,
      ride.dropoffCoords,
      prevCoords,
      prevName,
      schoolName,
    );
    const pickMatches = endMatchesOldSchool(
      ride.pickup,
      ride.pickupCoords,
      prevCoords,
      prevName,
      schoolName,
    );

    if (!dropMatches && !pickMatches) continue;

    if (dropMatches) {
      ride.dropoff = nextLabel;
      ride.dropoffCoords = nextCoords;
    }
    if (pickMatches) {
      ride.pickup = nextLabel;
      ride.pickupCoords = nextCoords;
    }
    await ride.save();
  }
}

router.get('/', async (req, res) => {
  const children = await Child.find({ parentId: req.user.id }).sort({
    createdAt: 1,
  });
  res.json({ children: children.map((c) => mapChildPublic(c)) });
});

const MAX_PHOTO_CHARS = 900_000; // ~675KB base64

function normalizePhotoUrl(photoUrl) {
  if (photoUrl == null) return undefined;
  const value = String(photoUrl).trim();
  if (!value) return '';
  if (value.length > MAX_PHOTO_CHARS) {
    const err = new Error('Photo is too large. Use a smaller image (under ~500KB).');
    err.status = 400;
    throw err;
  }
  if (
    !value.startsWith('data:image/') &&
    !value.startsWith('https://') &&
    !value.startsWith('http://')
  ) {
    const err = new Error('photoUrl must be an image data URL or http(s) URL');
    err.status = 400;
    throw err;
  }
  return value;
}

router.post('/', async (req, res) => {
  try {
    const {
      name,
      school = '',
      schoolAddress = '',
      schoolCoords = null,
      grade = 'Grade 5',
      photoUrl = '',
    } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Child name is required' });
    }
    const schoolName = String(school).trim();
    if (!schoolName) {
      return res.status(400).json({ error: 'School is required' });
    }

    const coords = parseLngLat(schoolCoords);
    const address = String(schoolAddress || schoolName).trim();

    const child = await Child.create({
      parentId: req.user.id,
      name: name.trim(),
      school: schoolName,
      schoolAddress: address,
      schoolCoords: coords || { lng: null, lat: null },
      grade,
      photoUrl: normalizePhotoUrl(photoUrl) || '',
    });

    res.status(201).json({ child: mapChildPublic(child) });
  } catch (err) {
    console.error('[children POST]', err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : 'Failed to create child',
    });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await Child.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    });
    if (!existing) return res.status(404).json({ error: 'Child not found' });

    const previous = {
      school: existing.school,
      schoolAddress: existing.schoolAddress,
      schoolCoords: existing.schoolCoords
        ? {
            lng: existing.schoolCoords.lng,
            lat: existing.schoolCoords.lat,
          }
        : null,
    };

    const { name, school, schoolAddress, schoolCoords, grade, photoUrl } =
      req.body || {};
    if (name != null) existing.name = name;
    if (school != null) existing.school = school;
    if (schoolAddress != null) existing.schoolAddress = schoolAddress;
    if (schoolCoords !== undefined) {
      const coords = parseLngLat(schoolCoords);
      existing.schoolCoords = coords || { lng: null, lat: null };
    }
    if (grade != null) existing.grade = grade;
    if (photoUrl !== undefined) {
      existing.photoUrl = normalizePhotoUrl(photoUrl) ?? '';
    }
    if (!String(existing.schoolAddress || '').trim()) {
      existing.schoolAddress = existing.school || '';
    }
    await existing.save();
    await syncUpcomingSchoolPins(existing, previous);

    res.json({ child: mapChildPublic(existing) });
  } catch (err) {
    console.error('[children PATCH]', err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : 'Failed to update child',
    });
  }
});

export default router;
