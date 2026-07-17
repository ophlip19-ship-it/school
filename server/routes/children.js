import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('parent'));

router.get('/', (req, res) => {
  const children = db
    .prepare('SELECT id, name, school, grade, created_at AS createdAt FROM children WHERE parent_id = ? ORDER BY created_at')
    .all(req.user.id);
  res.json({ children });
});

router.post('/', (req, res) => {
  const { name, school = 'Greenfield School', grade = 'Grade 5' } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Child name is required' });
  }
  const id = `child_${uuid().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO children (id, parent_id, name, school, grade)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, name.trim(), school, grade);

  const child = db
    .prepare('SELECT id, name, school, grade, created_at AS createdAt FROM children WHERE id = ?')
    .get(id);
  res.status(201).json({ child });
});

router.patch('/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM children WHERE id = ? AND parent_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Child not found' });

  const { name, school, grade } = req.body || {};
  db.prepare(`
    UPDATE children SET
      name = COALESCE(?, name),
      school = COALESCE(?, school),
      grade = COALESCE(?, grade)
    WHERE id = ?
  `).run(name ?? null, school ?? null, grade ?? null, existing.id);

  const child = db
    .prepare('SELECT id, name, school, grade, created_at AS createdAt FROM children WHERE id = ?')
    .get(existing.id);
  res.json({ child });
});

export default router;
