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

router.post('/', async (req, res) => {
  try {
    const { name, school = 'Greenfield School', grade = 'Grade 5' } =
      req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Child name is required' });
    }

    const child = await Child.create({
      parentId: req.user.id,
      name: name.trim(),
      school,
      grade,
    });

    res.status(201).json({ child: child.toPublic() });
  } catch (err) {
    console.error('[children POST]', err);
    res.status(500).json({ error: 'Failed to create child' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await Child.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    });
    if (!existing) return res.status(404).json({ error: 'Child not found' });

    const { name, school, grade } = req.body || {};
    if (name != null) existing.name = name;
    if (school != null) existing.school = school;
    if (grade != null) existing.grade = grade;
    await existing.save();

    res.json({ child: existing.toPublic() });
  } catch (err) {
    console.error('[children PATCH]', err);
    res.status(500).json({ error: 'Failed to update child' });
  }
});

export default router;
