import { Router } from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * Active (not suspended) drivers visible to parents for booking confidence.
 * Includes a simple availability signal based on open/assigned load.
 */
router.get(
  '/active',
  requireAuth,
  requireRole('parent', 'admin'),
  async (_req, res) => {
    try {
      const drivers = await User.find({
        role: 'driver',
        suspended: { $ne: true },
      })
        .sort({ verified: -1, name: 1 })
        .lean();

      const enriched = await Promise.all(
        drivers.map(async (d) => {
          const id = d._id.toString();
          const [activeCount, completedCount] = await Promise.all([
            Ride.countDocuments({
              driverId: d._id,
              status: { $in: ['assigned', 'in_transit'] },
            }),
            Ride.countDocuments({
              driverId: d._id,
              status: 'completed',
            }),
          ]);

          const available = activeCount === 0;

          return {
            id,
            name: d.name,
            phone: d.phone || '',
            vehiclePlate: d.vehiclePlate || '',
            verified: !!d.verified,
            available,
            activeTrips: activeCount,
            completedTrips: completedCount,
            // Simple demo rating derived from trip volume
            rating: Math.min(
              5,
              Math.round((4.5 + Math.min(completedCount, 50) / 100) * 10) / 10,
            ),
          };
        }),
      );

      // Available first, then verified, then name
      enriched.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ drivers: enriched });
    } catch (err) {
      console.error('[drivers/active]', err);
      res.status(500).json({ error: 'Failed to list active drivers' });
    }
  },
);

export default router;
