import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Child from '../models/Child.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { mapTransitRide } from '../utils/mappers.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

function formatTime(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString();
  } catch {
    return String(date);
  }
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function rideStatsForUser(userId, role) {
  const filter =
    role === 'driver' ? { driverId: userId } : { parentId: userId };
  const [total, completed, active] = await Promise.all([
    Ride.countDocuments(filter),
    Ride.countDocuments({ ...filter, status: 'completed' }),
    Ride.countDocuments({
      ...filter,
      status: { $in: ['open', 'requested', 'assigned', 'in_transit'] },
    }),
  ]);
  return { totalRides: total, completedRides: completed, activeRides: active };
}

function mapChild(c) {
  return {
    id: c._id.toString(),
    name: c.name,
    school: c.school,
    grade: c.grade,
  };
}

function mapRideSummary(r) {
  return {
    id: r._id.toString(),
    childName: r.childName,
    status: r.status,
    pickup: r.pickup,
    dropoff: r.dropoff,
    date: r.rideDate,
    time: r.rideTime,
    paymentStatus: r.paymentStatus,
    updatedAt: r.updatedAt,
  };
}

/** Dashboard stats + recent activity */
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
      User.countDocuments({ role: 'driver', suspended: { $ne: true } }),
      User.countDocuments({ role: 'parent' }),
      Child.countDocuments(),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({
        status: { $in: ['open', 'requested', 'assigned', 'in_transit'] },
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
      time: formatTime(r.updatedAt),
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

/**
 * List drivers or parents with summary details.
 * Query: ?role=driver | ?role=parent
 */
router.get('/users', async (req, res) => {
  try {
    const role = String(req.query.role || '').toLowerCase();
    if (!['driver', 'parent'].includes(role)) {
      return res
        .status(400)
        .json({ error: 'Query role must be "driver" or "parent"' });
    }

    const users = await User.find({ role }).sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(
      users.map(async (u) => {
        const id = u._id.toString();
        const stats = await rideStatsForUser(u._id, role);
        const base = {
          id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: u.role,
          verified: !!u.verified,
          suspended: !!u.suspended,
          createdAt: u.createdAt,
          ...stats,
        };

        if (role === 'driver') {
          return {
            ...base,
            vehiclePlate: u.vehiclePlate || '',
          };
        }

        const children = await Child.find({ parentId: u._id })
          .sort({ createdAt: 1 })
          .lean();
        return {
          ...base,
          children: children.map(mapChild),
          childrenCount: children.length,
        };
      }),
    );

    res.json({ users: enriched });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * Full detail for a single driver or parent.
 * Includes ride stats, recent rides, and children (parents).
 */
router.get('/users/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const userDoc = await User.findById(req.params.id).lean();
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!['driver', 'parent'].includes(userDoc.role)) {
      return res
        .status(400)
        .json({ error: 'Only drivers and parents are viewable' });
    }

    const stats = await rideStatsForUser(userDoc._id, userDoc.role);
    const recentRides = await Ride.find(
      userDoc.role === 'driver'
        ? { driverId: userDoc._id }
        : { parentId: userDoc._id },
    )
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    const user = {
      id: userDoc._id.toString(),
      name: userDoc.name,
      email: userDoc.email,
      phone: userDoc.phone || '',
      role: userDoc.role,
      verified: !!userDoc.verified,
      suspended: !!userDoc.suspended,
      vehiclePlate: userDoc.vehiclePlate || '',
      createdAt: userDoc.createdAt,
      updatedAt: userDoc.updatedAt,
      ...stats,
      recentRides: recentRides.map(mapRideSummary),
    };

    if (userDoc.role === 'parent') {
      const children = await Child.find({ parentId: userDoc._id })
        .sort({ createdAt: 1 })
        .lean();
      user.children = children.map(mapChild);
      user.childrenCount = children.length;
    }

    res.json({ user });
  } catch (err) {
    console.error('[admin/users/:id]', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

/** Suspend a driver — blocks login and authenticated API use */
router.post('/drivers/:id/suspend', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid driver id' });
    }

    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (driver.suspended) {
      return res.status(400).json({ error: 'Driver is already suspended' });
    }

    driver.suspended = true;
    await driver.save();

    res.json({
      user: driver.toPublic(),
      message: 'Driver suspended successfully',
    });
  } catch (err) {
    console.error('[admin/drivers suspend]', err);
    res.status(500).json({ error: 'Failed to suspend driver' });
  }
});

/** Reinstate a suspended driver */
router.post('/drivers/:id/unsuspend', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid driver id' });
    }

    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (!driver.suspended) {
      return res.status(400).json({ error: 'Driver is not suspended' });
    }

    driver.suspended = false;
    await driver.save();

    res.json({
      user: driver.toPublic(),
      message: 'Driver reinstated successfully',
    });
  } catch (err) {
    console.error('[admin/drivers unsuspend]', err);
    res.status(500).json({ error: 'Failed to unsuspend driver' });
  }
});

/**
 * All drivers currently in transit with live location, trail, route anchors, and feed.
 * Used by the admin fleet / transit map.
 */
router.get('/transit', async (_req, res) => {
  try {
    const rides = await Ride.find({
      status: 'in_transit',
      locationSharing: true,
      driverId: { $ne: null },
    })
      .populate('parentId', 'name phone')
      .populate('driverId', 'name phone vehiclePlate')
      .sort({ pickedUpAt: -1, updatedAt: -1 })
      .lean();

    res.json({
      rides: rides.map((r) => mapTransitRide(r)),
      count: rides.length,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/transit]', err);
    res.status(500).json({ error: 'Failed to load transit rides' });
  }
});

export default router;
