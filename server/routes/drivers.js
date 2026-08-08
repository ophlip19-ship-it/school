import { Router } from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { haversineKm } from '../utils/pricing.js';

const router = Router();

function parseCoordPair(src) {
  const lng = Number(src?.lng ?? src?.pickupLng);
  const lat = Number(src?.lat ?? src?.pickupLat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lng, lat };
}

/**
 * Active (not suspended) drivers visible to parents for booking confidence.
 * Includes a simple availability signal based on open/assigned load.
 * Optional ?lng=&lat= (or pickupLng/pickupLat) ranks free drivers by distance.
 */
router.get(
  '/active',
  requireAuth,
  requireRole('parent', 'admin'),
  async (req, res) => {
    try {
      const near = parseCoordPair(req.query || {});

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
          const location =
            d.lastLocation?.lng != null && d.lastLocation?.lat != null
              ? {
                  lng: d.lastLocation.lng,
                  lat: d.lastLocation.lat,
                  heading: d.lastLocation.heading || 0,
                  updatedAt: d.lastLocation.updatedAt,
                }
              : null;

          let distanceKm = null;
          if (near && location) {
            const km = haversineKm(location, near);
            distanceKm =
              km != null ? Math.round(km * 100) / 100 : null;
          }

          return {
            id,
            name: d.name,
            phone: d.phone || '',
            vehiclePlate: d.vehiclePlate || '',
            verified: !!d.verified,
            available,
            activeTrips: activeCount,
            completedTrips: completedCount,
            location,
            distanceKm,
            // Simple demo rating derived from trip volume
            rating: Math.min(
              5,
              Math.round((4.5 + Math.min(completedCount, 50) / 100) * 10) / 10,
            ),
          };
        }),
      );

      // Nearest free first when a reference point is given; else available → verified → name
      enriched.sort((a, b) => {
        if (near) {
          if (a.available !== b.available) return a.available ? -1 : 1;
          const da = a.distanceKm ?? Infinity;
          const db = b.distanceKm ?? Infinity;
          if (da !== db) return da - db;
        } else {
          if (a.available !== b.available) return a.available ? -1 : 1;
        }
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ drivers: enriched, near });
    } catch (err) {
      console.error('[drivers/active]', err);
      res.status(500).json({ error: 'Failed to list active drivers' });
    }
  },
);

/**
 * Driver GPS heartbeat — keeps lastLocation fresh for nearest-driver assignment.
 * Called while the driver is online on the dashboard (even without an active trip).
 */
router.post(
  '/location',
  requireAuth,
  requireRole('driver'),
  async (req, res) => {
    try {
      const lng = Number(req.body?.lng);
      const lat = Number(req.body?.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return res.status(400).json({ error: 'lng and lat are required' });
      }
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      const heading = Number(req.body?.heading) || 0;
      const now = new Date();
      const lastLocation = { lng, lat, heading, updatedAt: now };

      await User.findByIdAndUpdate(req.user.id, { lastLocation });

      res.json({ ok: true, lastLocation });
    } catch (err) {
      console.error('[drivers/location]', err);
      res.status(500).json({ error: 'Failed to update location' });
    }
  },
);

export default router;
