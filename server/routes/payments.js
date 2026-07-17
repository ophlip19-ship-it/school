import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import Stripe from 'stripe';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const demoPayments = process.env.DEMO_PAYMENTS !== 'false';

function markRidePaid(rideId, userId, amountCents, provider, providerRef) {
  const paymentId = `pay_${uuid().slice(0, 8)}`;
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, ride_id, user_id, amount_cents, currency, status, provider, provider_ref)
      VALUES (?, ?, ?, ?, 'ngn', 'succeeded', ?, ?)
    `).run(paymentId, rideId, userId, amountCents, provider, providerRef || null);

    db.prepare(`
      UPDATE rides SET
        payment_status = 'paid',
        status = 'open',
        stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(provider === 'stripe' ? providerRef : null, rideId);
  });
  tx();
  return paymentId;
}

router.get('/config', (_req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    demoMode: !stripe || demoPayments,
    currency: 'ngn',
  });
});

router.post('/create-intent', requireAuth, requireRole('parent'), async (req, res) => {
  const { rideId } = req.body || {};
  if (!rideId) return res.status(400).json({ error: 'rideId is required' });

  const ride = db
    .prepare('SELECT * FROM rides WHERE id = ? AND parent_id = ?')
    .get(rideId, req.user.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.payment_status === 'paid') {
    return res.status(400).json({ error: 'Ride already paid' });
  }

  // Stripe in NGN uses the smallest currency unit (kobo). Amounts stored as kobo.
  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: ride.fare_cents,
        currency: 'ngn',
        metadata: {
          rideId: ride.id,
          userId: req.user.id,
        },
        automatic_payment_methods: { enabled: true },
      });

      db.prepare(`
        UPDATE rides SET stripe_payment_intent_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(intent.id, ride.id);

      return res.json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: ride.fare_cents,
        currency: 'ngn',
        demoMode: false,
      });
    } catch (err) {
      console.error('[stripe]', err.message);
      if (!demoPayments) {
        return res.status(502).json({ error: err.message || 'Stripe error' });
      }
      // fall through to demo
    }
  }

  if (!demoPayments) {
    return res.status(503).json({
      error: 'Stripe is not configured. Set STRIPE_SECRET_KEY or enable DEMO_PAYMENTS.',
    });
  }

  return res.json({
    clientSecret: null,
    paymentIntentId: null,
    amount: ride.fare_cents,
    currency: 'ngn',
    demoMode: true,
    rideId: ride.id,
  });
});

router.post('/confirm-demo', requireAuth, requireRole('parent'), (req, res) => {
  if (!demoPayments && stripe) {
    return res.status(400).json({ error: 'Demo payments disabled' });
  }

  const { rideId, cardNumber } = req.body || {};
  if (!rideId) return res.status(400).json({ error: 'rideId is required' });

  const ride = db
    .prepare('SELECT * FROM rides WHERE id = ? AND parent_id = ?')
    .get(rideId, req.user.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.payment_status === 'paid') {
    return res.json({ ok: true, alreadyPaid: true });
  }

  // Basic Luhn-ish demo: accept any 16-digit card ending in even digit, or test 4242...
  const digits = String(cardNumber || '').replace(/\s/g, '');
  if (digits && digits.length >= 13 && !/^\d+$/.test(digits)) {
    return res.status(400).json({ error: 'Invalid card number' });
  }
  if (digits && digits.endsWith('0000')) {
    return res.status(402).json({ error: 'Card declined (demo). Use any card not ending in 0000.' });
  }

  const paymentId = markRidePaid(
    ride.id,
    req.user.id,
    ride.fare_cents,
    'demo',
    `demo_${uuid().slice(0, 8)}`,
  );

  const updated = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
  res.json({
    ok: true,
    paymentId,
    ride: {
      id: updated.id,
      status: updated.status,
      paymentStatus: updated.payment_status,
      handoverPin: updated.handover_pin,
    },
  });
});

router.post('/confirm-stripe', requireAuth, requireRole('parent'), async (req, res) => {
  const { rideId, paymentIntentId } = req.body || {};
  if (!rideId || !paymentIntentId) {
    return res.status(400).json({ error: 'rideId and paymentIntentId are required' });
  }

  const ride = db
    .prepare('SELECT * FROM rides WHERE id = ? AND parent_id = ?')
    .get(rideId, req.user.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.payment_status === 'paid') {
    return res.json({ ok: true, alreadyPaid: true });
  }

  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment not completed (status: ${intent.status})` });
    }
    if (intent.metadata?.rideId && intent.metadata.rideId !== rideId) {
      return res.status(400).json({ error: 'Payment does not match ride' });
    }

    const paymentId = markRidePaid(
      ride.id,
      req.user.id,
      ride.fare_cents,
      'stripe',
      paymentIntentId,
    );

    const updated = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
    return res.json({
      ok: true,
      paymentId,
      ride: {
        id: updated.id,
        status: updated.status,
        paymentStatus: updated.payment_status,
        handoverPin: updated.handover_pin,
      },
    });
  } catch (err) {
    console.error('[stripe confirm]', err.message);
    return res.status(502).json({ error: err.message || 'Stripe confirmation failed' });
  }
});

export default router;
