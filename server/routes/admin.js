import { Router } from 'express';
import User from '../models/User.js';
import Child from '../models/Child.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/stats', async (_req, res) => {
  try {
    const [
      totalUsers,
      activeDrivers,
      activeParents,
      children,
      completedRides,
      openRides,
      revenueAgg,
      recent,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'driver' }),
      User.countDocuments({ role: 'parent' }),
      Child.countDocuments(),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({
        status: { $in: ['open', 'assigned', 'in_transit'] },
      }),
      Payment.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      Ride.find().sort({ updatedAt: -1 }).limit(10).lean(),
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    const recentActivity = recent.map((r) => ({
      id: r._id.toString(),
      user: r.childName,
      action: `Ride ${r.status}`,
      time: r.updatedAt,
      status: r.paymentStatus === 'paid' ? 'success' : 'info',
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
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;
