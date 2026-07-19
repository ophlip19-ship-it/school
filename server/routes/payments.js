import { Router } from 'express';
import Stripe from 'stripe';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const demoPayments = process.env.DEMO_PAYMENTS !== 'false';

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

  await Ride.findByIdAndUpdate(rideId, {
    paymentStatus: 'paid',
    status: 'open',
    ...(provider === 'stripe' && providerRef
      ? { stripePaymentIntentId: providerRef }
      : {}),
  });

  return payment._id.toString();
}

router.get('/config', (_req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    demoMode: !stripe || demoPayments,
    currency: 'ngn',
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

export default router;
