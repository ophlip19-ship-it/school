import { Router } from 'express';
import Stripe from 'stripe';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { haversineKm, pickNearestDriver } from '../utils/pricing.js';

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const demoPayments = process.env.DEMO_PAYMENTS !== 'false';

/** Free (no assigned/in-transit ride) drivers, optionally ranked to a point. */
async function listFreeDriversNear(targetCoords = null) {
  const drivers = await User.find({
    role: 'driver',
    suspended: { $ne: true },
  }).lean();

  const free = [];
  for (const d of drivers) {
    const activeCount = await Ride.countDocuments({
      driverId: d._id,
      status: { $in: ['assigned', 'in_transit'] },
    });
    if (activeCount === 0) free.push(d);
  }

  if (!targetCoords || free.length === 0) return free;

  return free
    .map((d) => {
      const km = haversineKm(d.lastLocation, targetCoords);
      return { ...d, _distKm: km == null ? Infinity : km };
    })
    .sort((a, b) => a._distKm - b._distKm);
}

/**
 * After payment succeeds, resolve post-pay status from assignMode:
 *  - choose  → keep preferred driver, status requested
 *  - nearest → re-pick nearest free driver (fresh GPS), status requested
 *  - pool    → clear driver, status open for any driver
 */
async function resolvePostPaymentAssignment(ride) {
  const mode = String(ride.assignMode || '').toLowerCase();
  const pickup = ride.pickupCoords;

  if (mode === 'pool') {
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  if (mode === 'nearest') {
    const free = await listFreeDriversNear(pickup);
    // Prefer a free driver who still matches provisional pick if still free
    const provisionalId = ride.driverId?.toString?.() || ride.driverId;
    const stillFree = provisionalId
      ? free.find((d) => d._id.toString() === provisionalId)
      : null;
    const picked = stillFree
      ? { driver: stillFree }
      : pickNearestDriver(free, pickup);

    if (picked?.driver) {
      return {
        driverId: picked.driver._id,
        status: 'requested',
        assignMode: 'nearest',
      };
    }
    // Nobody free with GPS → fall open so any driver can grab it
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  // choose (or legacy rides with a preferred driverId)
  if (ride.driverId) {
    // Ensure preferred driver is still active / not suspended
    const driver = await User.findOne({
      _id: ride.driverId,
      role: 'driver',
      suspended: { $ne: true },
    }).select('_id');
    if (driver) {
      return {
        driverId: driver._id,
        status: 'requested',
        assignMode: 'choose',
      };
    }
    // Preferred driver gone → open pool
    return { driverId: null, status: 'open', assignMode: 'pool' };
  }

  return { driverId: null, status: 'open', assignMode: mode || 'pool' };
}

async function markRidePaid(rideId, userId, amountCents, provider, providerRef) {
  const payment = await Payment.create({
    rideId,
    userId,
    amountCents,
    currency: 'ngn',
    status: 'succeeded',
    provider,
    providerRef: providerRef || null,
  });

  const existing = await Ride.findById(rideId).select(
    'driverId assignMode pickupCoords',
  );
  const assignment = existing
    ? await resolvePostPaymentAssignment(existing)
    : { driverId: null, status: 'open', assignMode: 'pool' };

  await Ride.findByIdAndUpdate(rideId, {
    paymentStatus: 'paid',
    status: assignment.status,
    driverId: assignment.driverId,
    assignMode: assignment.assignMode,
    ...(provider === 'stripe' && providerRef
      ? { stripePaymentIntentId: providerRef }
      : {}),
  });

  return payment._id.toString();
}

const TRANSFER_BANK = {
  bankName: process.env.TRANSFER_BANK_NAME || 'SchoolRun Escrow Bank',
  accountName: process.env.TRANSFER_ACCOUNT_NAME || 'SchoolRun Payments Ltd',
  accountNumber: process.env.TRANSFER_ACCOUNT_NUMBER || '0123456789',
};

router.get('/config', (_req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    demoMode: !stripe || demoPayments,
    currency: 'ngn',
    methods: ['card', 'transfer'],
    transfer: TRANSFER_BANK,
  });
});

router.post(
  '/create-intent',
  requireAuth,
  requireRole('parent'),
  async (req, res) => {
    try {
      const { rideId } = req.body || {};
      if (!rideId) return res.status(400).json({ error: 'rideId is required' });

      const ride = await Ride.findOne({
        _id: rideId,
        parentId: req.user.id,
      });
      if (!ride) return res.status(404).json({ error: 'Ride not found' });
      if (ride.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Ride already paid' });
      }

      if (stripe) {
        try {
          const intent = await stripe.paymentIntents.create({
            amount: ride.fareCents,
            currency: 'ngn',
            metadata: {
              rideId: ride._id.toString(),
              userId: req.user.id,
            },
            automatic_payment_methods: { enabled: true },
          });

          ride.stripePaymentIntentId = intent.id;
          await ride.save();

          return res.json({
            clientSecret: intent.client_secret,
            paymentIntentId: intent.id,
            amount: ride.fareCents,
            currency: 'ngn',
            demoMode: false,
          });
        } catch (err) {
          console.error('[stripe]', err.message);
          if (!demoPayments) {
            return res.status(502).json({ error: err.message || 'Stripe error' });
          }
        }
      }

      if (!demoPayments) {
        return res.status(503).json({
          error:
            'Stripe is not configured. Set STRIPE_SECRET_KEY or enable DEMO_PAYMENTS.',
        });
      }

      return res.json({
        clientSecret: null,
        paymentIntentId: null,
        amount: ride.fareCents,
        currency: 'ngn',
        demoMode: true,
        rideId: ride._id.toString(),
      });
    } catch (err) {
      console.error('[payments create-intent]', err);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  },
);

router.post(
  '/confirm-demo',
  requireAuth,
  requireRole('parent'),
  async (req, res) => {
    try {
      if (!demoPayments && stripe) {
        return res.status(400).json({ error: 'Demo payments disabled' });
      }

      const { rideId, cardNumber } = req.body || {};
      if (!rideId) return res.status(400).json({ error: 'rideId is required' });

      const ride = await Ride.findOne({
        _id: rideId,
        parentId: req.user.id,
      });
      if (!ride) return res.status(404).json({ error: 'Ride not found' });
      if (ride.paymentStatus === 'paid') {
        return res.json({ ok: true, alreadyPaid: true });
      }

      const digits = String(cardNumber || '').replace(/\s/g, '');
      if (digits && digits.length >= 13 && !/^\d+$/.test(digits)) {
        return res.status(400).json({ error: 'Invalid card number' });
      }
      if (digits && digits.endsWith('0000')) {
        return res.status(402).json({
          error: 'Card declined (demo). Use any card not ending in 0000.',
        });
      }

      const paymentId = await markRidePaid(
        ride._id,
        req.user.id,
        ride.fareCents,
        'demo',
        `demo_${Date.now().toString(36)}`,
      );

      const updated = await Ride.findById(ride._id);
      res.json({
        ok: true,
        paymentId,
        ride: {
          id: updated._id.toString(),
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          handoverPin: updated.handoverPin,
        },
      });
    } catch (err) {
      console.error('[payments confirm-demo]', err);
      res.status(500).json({ error: 'Demo payment failed' });
    }
  },
);

router.post(
  '/confirm-stripe',
  requireAuth,
  requireRole('parent'),
  async (req, res) => {
    try {
      const { rideId, paymentIntentId } = req.body || {};
      if (!rideId || !paymentIntentId) {
        return res
          .status(400)
          .json({ error: 'rideId and paymentIntentId are required' });
      }

      const ride = await Ride.findOne({
        _id: rideId,
        parentId: req.user.id,
      });
      if (!ride) return res.status(404).json({ error: 'Ride not found' });
      if (ride.paymentStatus === 'paid') {
        return res.json({ ok: true, alreadyPaid: true });
      }

      if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== 'succeeded') {
        return res
          .status(400)
          .json({ error: `Payment not completed (status: ${intent.status})` });
      }
      if (intent.metadata?.rideId && intent.metadata.rideId !== rideId) {
        return res.status(400).json({ error: 'Payment does not match ride' });
      }

      const paymentId = await markRidePaid(
        ride._id,
        req.user.id,
        ride.fareCents,
        'stripe',
        paymentIntentId,
      );

      const updated = await Ride.findById(ride._id);
      return res.json({
        ok: true,
        paymentId,
        ride: {
          id: updated._id.toString(),
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          handoverPin: updated.handoverPin,
        },
      });
    } catch (err) {
      console.error('[stripe confirm]', err.message);
      return res
        .status(502)
        .json({ error: err.message || 'Stripe confirmation failed' });
    }
  },
);

/**
 * Bank transfer payment details + payment reference for a ride.
 * Parent transfers the fare using the reference, then confirms.
 */
router.get(
  '/transfer-details/:rideId',
  requireAuth,
  requireRole('parent'),
  async (req, res) => {
    try {
      const ride = await Ride.findOne({
        _id: req.params.rideId,
        parentId: req.user.id,
      });
      if (!ride) return res.status(404).json({ error: 'Ride not found' });
      if (ride.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Ride already paid' });
      }

      const shortId = ride._id.toString().slice(-6).toUpperCase();
      const reference = `SR-${shortId}`;

      res.json({
        rideId: ride._id.toString(),
        amountCents: ride.fareCents,
        currency: ride.currency || 'ngn',
        reference,
        bank: TRANSFER_BANK,
        instructions:
          'Transfer the exact amount and use the payment reference as your transfer narration. Then tap “I’ve paid” to confirm.',
      });
    } catch (err) {
      console.error('[payments transfer-details]', err);
      res.status(500).json({ error: 'Failed to load transfer details' });
    }
  },
);

/**
 * Confirm bank transfer (demo / manual verification path).
 * In production this would wait for webhook from a payment provider.
 */
router.post(
  '/confirm-transfer',
  requireAuth,
  requireRole('parent'),
  async (req, res) => {
    try {
      const { rideId, reference, senderName } = req.body || {};
      if (!rideId) return res.status(400).json({ error: 'rideId is required' });

      const ride = await Ride.findOne({
        _id: rideId,
        parentId: req.user.id,
      });
      if (!ride) return res.status(404).json({ error: 'Ride not found' });
      if (ride.paymentStatus === 'paid') {
        return res.json({ ok: true, alreadyPaid: true });
      }

      const shortId = ride._id.toString().slice(-6).toUpperCase();
      const expectedRef = `SR-${shortId}`;
      const given = String(reference || '').trim().toUpperCase();
      if (given && given !== expectedRef && !given.includes(shortId)) {
        return res.status(400).json({
          error: `Reference should be ${expectedRef} (or include ${shortId})`,
        });
      }

      const paymentId = await markRidePaid(
        ride._id,
        req.user.id,
        ride.fareCents,
        'transfer',
        given || expectedRef,
      );

      // Store optional sender note on payment via providerRef already set
      void senderName;

      const updated = await Ride.findById(ride._id);
      res.json({
        ok: true,
        paymentId,
        method: 'transfer',
        ride: {
          id: updated._id.toString(),
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          handoverPin: updated.handoverPin,
        },
      });
    } catch (err) {
      console.error('[payments confirm-transfer]', err);
      res.status(500).json({ error: 'Transfer confirmation failed' });
    }
  },
);

export default router;
