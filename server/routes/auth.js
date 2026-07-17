import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db, { publicUser } from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req, res) => {
  const {
    email,
    password,
    name,
    role = 'parent',
    phone = '',
    childName,
    school = 'Greenfield School',
    vehiclePlate = '',
  } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (!['parent', 'driver', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const id = `user_${uuid().slice(0, 8)}`;
  const password_hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, name, phone, vehicle_plate, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(email).toLowerCase().trim(),
    password_hash,
    role,
    String(name).trim(),
    String(phone || '').trim(),
    role === 'driver' ? String(vehiclePlate || '56A-902-LGS').trim() : '',
    role === 'parent' ? 0 : 1,
  );

  let child = null;
  if (role === 'parent') {
    const childId = `child_${uuid().slice(0, 8)}`;
    const cName = String(childName || 'Alex').trim();
    db.prepare(`
      INSERT INTO children (id, parent_id, name, school, grade)
      VALUES (?, ?, ?, ?, ?)
    `).run(childId, id, cName, school, 'Grade 5');
    child = { id: childId, name: cName, school, grade: 'Grade 5' };
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const user = enrichUser(publicUser(row));
  const token = signToken(row);

  return res.status(201).json({ token, user, child });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = enrichUser(publicUser(row));
  const token = signToken(row);
  return res.json({ token, user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: enrichUser(req.user) });
});

router.patch('/me', requireAuth, (req, res) => {
  const { name, phone, vehiclePlate } = req.body || {};
  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      vehicle_plate = COALESCE(?, vehicle_plate)
    WHERE id = ?
  `).run(
    name ?? null,
    phone ?? null,
    vehiclePlate ?? null,
    req.user.id,
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: enrichUser(publicUser(row)) });
});

router.post('/verify', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(req.user.id);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: enrichUser(publicUser(row)) });
});

function enrichUser(user) {
  if (!user) return null;
  if (user.role === 'parent') {
    const children = db
      .prepare('SELECT id, name, school, grade FROM children WHERE parent_id = ? ORDER BY created_at')
      .all(user.id);
    const primary = children[0];
    return {
      ...user,
      children,
      childName: primary?.name || '',
      school: primary?.school || '',
      childId: primary?.id || null,
    };
  }
  if (user.role === 'driver') {
    return {
      ...user,
      driverName: user.name,
      vehiclePlate: user.vehiclePlate,
    };
  }
  return user;
}

export default router;
