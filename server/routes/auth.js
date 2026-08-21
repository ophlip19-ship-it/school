import { Router } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Child, { mapChildPublic } from '../models/Child.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

async function enrichUser(publicUser) {
  if (!publicUser) return null;

  if (publicUser.role === 'parent') {
    const children = await Child.find({ parentId: publicUser.id })
      .sort({ createdAt: 1 })
      .lean();
    const mapped = children.map((c) => mapChildPublic(c));
    const primary = mapped[0];
    return {
      ...publicUser,
      children: mapped,
      childName: primary?.name || '',
      school: primary?.school || '',
      schoolAddress: primary?.schoolAddress || '',
      schoolCoords: primary?.schoolCoords || null,
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
      vehiclePlate = '',
      homeAddress = '',
      homeCoords = null,
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

    const parsedHomeCoords =
      homeCoords &&
      Number.isFinite(Number(homeCoords.lng)) &&
      Number.isFinite(Number(homeCoords.lat))
        ? { lng: Number(homeCoords.lng), lat: Number(homeCoords.lat) }
        : { lng: null, lat: null };

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
      homeAddress:
        role === 'parent' ? String(homeAddress || '').trim() : '',
      homeCoords: role === 'parent' ? parsedHomeCoords : { lng: null, lat: null },
      verified: role !== 'parent',
    });

    const user = await enrichUser(userDoc.toPublic());
    const token = signToken(userDoc);
    return res.status(201).json({ token, user });
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

/**
 * Re-authenticate before sensitive profile changes.
 * Body: { password }
 */
router.post('/confirm-identity', requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Password is required to verify your identity' });
    }
    const ok = await bcrypt.compare(String(password), req.userDoc.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }
    return res.json({ ok: true, message: 'Identity confirmed' });
  } catch (err) {
    console.error('[auth/confirm-identity]', err);
    return res.status(500).json({ error: 'Could not verify identity' });
  }
});

/**
 * Update profile. Requires currentPassword so only the account owner can change details.
 * Body: { currentPassword, name?, phone?, vehiclePlate?, homeAddress?, homeCoords? }
 */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const {
      currentPassword,
      name,
      phone,
      vehiclePlate,
      homeAddress,
      homeCoords,
    } = req.body || {};

    if (!currentPassword) {
      return res
        .status(400)
        .json({ error: 'Enter your password to confirm it is you before saving changes' });
    }

    const ok = await bcrypt.compare(String(currentPassword), req.userDoc.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password. Changes were not saved.' });
    }

    if (name != null) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      req.userDoc.name = trimmed;
    }
    if (phone != null) req.userDoc.phone = String(phone).trim();
    if (vehiclePlate != null) {
      req.userDoc.vehiclePlate = String(vehiclePlate).trim();
    }
    if (homeAddress != null) {
      req.userDoc.homeAddress = String(homeAddress).trim();
    }
    if (
      homeCoords &&
      Number.isFinite(Number(homeCoords.lng)) &&
      Number.isFinite(Number(homeCoords.lat))
    ) {
      req.userDoc.homeCoords = {
        lng: Number(homeCoords.lng),
        lat: Number(homeCoords.lat),
      };
    } else if (homeCoords === null) {
      req.userDoc.homeCoords = { lng: null, lat: null };
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
