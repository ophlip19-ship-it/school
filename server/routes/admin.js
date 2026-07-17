import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/stats', (_req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeDrivers = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'driver'`).get().c;
  const activeParents = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'parent'`).get().c;
  const children = db.prepare('SELECT COUNT(*) AS c FROM children').get().c;
  const completedRides = db
    .prepare(`SELECT COUNT(*) AS c FROM rides WHERE status = 'completed'`)
    .get().c;
  const openRides = db
    .prepare(`SELECT COUNT(*) AS c FROM rides WHERE status IN ('open','assigned','in_transit')`)
    .get().c;
  const revenue = db
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE status = 'succeeded'`)
    .get().s;

  const recentActivity = db
    .prepare(`
      SELECT r.id, r.child_name AS user, r.status AS action, r.updated_at AS time, r.payment_status AS status
      FROM rides r
      ORDER BY r.updated_at DESC
      LIMIT 10
    `)
    .all()
    .map((r) => ({
      id: r.id,
      user: r.user,
      action: `Ride ${r.action}`,
      time: r.time,
      status: r.status === 'paid' ? 'success' : 'info',
    }));

  res.json({
    stats: {
      totalUsers,
      activeDrivers,
      activeParents,
      children,
      completedRides,
      openRides,
      totalRevenue: Math.round(revenue / 100),
      avgRating: 4.7,
    },
    recentActivity,
  });
});

export default router;
