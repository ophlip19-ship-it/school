import { Router } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Child from '../models/Child.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

async function enrichUser(publicUser) {
  if (!publicUser) return null;

  if (publicUser.role === 'parent') {
    const children = await Child.find({ parentId: publicUser.id })
      .sort({ createdAt: 1 })
      .lean();
    const mapped = children.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      school: c.school,
      grade: c.grade,
    }));
    const primary = mapped[0];
    return {
      ...publicUser,
      children: mapped,
      childName: primary?.name || '',
      school: primary?.school || '',
      childId: primary?.id || null,
    };
  }

  if (publicUser.role === 'driver') {
    return {
      ...publicUser,
      driverName: publicUser.name,
      vehiclePlate: publicUser.vehiclePlate,
    };
  }

  return publicUser;
}

router.post('/register', async (req, res) => {
  try {
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
      return res
        .status(400)
        .json({ error: 'Name, email, and password are required' });
    }
    if (!['parent', 'driver', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userDoc = await User.create({
      email: normalizedEmail,
      passwordHash,
      role,
      name: String(name).trim(),
      phone: String(phone || '').trim(),
      vehiclePlate:
        role === 'driver'
          ? String(vehiclePlate || '56A-902-LGS').trim()
          : '',
      verified: role !== 'parent',
    });

    let child = null;
    if (role === 'parent') {
      const cName = String(childName || 'Alex').trim();
      const childDoc = await Child.create({
        parentId: userDoc._id,
        name: cName,
        school,
        grade: 'Grade 5',
      });
      child = {
        id: childDoc._id.toString(),
        name: childDoc.name,
        school: childDoc.school,
        grade: childDoc.grade,
      };
    }

    const user = await enrichUser(userDoc.toPublic());
    const token = signToken(userDoc);
    return res.status(201).json({ token, user, child });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userDoc = await User.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (!userDoc) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, userDoc.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (userDoc.suspended) {
      return res
        .status(403)
        .json({ error: 'Account suspended. Contact support.' });
    }

    const user = await enrichUser(userDoc.toPublic());
    const token = signToken(userDoc);
    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await enrichUser(req.user);
  res.json({ user });
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone, vehiclePlate } = req.body || {};
    if (name != null) req.userDoc.name = String(name).trim();
    if (phone != null) req.userDoc.phone = String(phone).trim();
    if (vehiclePlate != null) {
      req.userDoc.vehiclePlate = String(vehiclePlate).trim();
    }
    await req.userDoc.save();
    const user = await enrichUser(req.userDoc.toPublic());
    res.json({ user });
  } catch (err) {
    console.error('[auth/me PATCH]', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.post('/verify', requireAuth, async (req, res) => {
  try {
    req.userDoc.verified = true;
    await req.userDoc.save();
    const user = await enrichUser(req.userDoc.toPublic());
    res.json({ user });
  } catch (err) {
    console.error('[auth/verify]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
