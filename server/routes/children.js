import { Router } from 'express';
import Child from '../models/Child.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('parent'));

router.get('/', async (req, res) => {
  const children = await Child.find({ parentId: req.user.id }).sort({
    createdAt: 1,
  });
  res.json({ children: children.map((c) => c.toPublic()) });
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
      school = 'Greenfield School',
      grade = 'Grade 5',
      photoUrl = '',
    } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Child name is required' });
    }

    const child = await Child.create({
      parentId: req.user.id,
      name: name.trim(),
      school,
      grade,
      photoUrl: normalizePhotoUrl(photoUrl) || '',
    });

    res.status(201).json({ child: child.toPublic() });
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

    const { name, school, grade, photoUrl } = req.body || {};
    if (name != null) existing.name = name;
    if (school != null) existing.school = school;
    if (grade != null) existing.grade = grade;
    if (photoUrl !== undefined) {
      existing.photoUrl = normalizePhotoUrl(photoUrl) ?? '';
    }
    await existing.save();

    res.json({ child: existing.toPublic() });
  } catch (err) {
    console.error('[children PATCH]', err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : 'Failed to update child',
    });
  }
});

export default router;
