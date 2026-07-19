import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'schoolrun-dev-secret-change-me';

export function signToken(user) {
  const id = user._id?.toString?.() || user.id;
  return jwt.sign(
    { sub: id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userDoc = await User.findById(payload.sub);
    if (!userDoc) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (userDoc.suspended) {
      return res
        .status(403)
        .json({ error: 'Account suspended. Contact support.' });
    }
    req.user = userDoc.toPublic();
    req.userDoc = userDoc;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export { JWT_SECRET };
