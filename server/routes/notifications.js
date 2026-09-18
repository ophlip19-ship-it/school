import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { VAPID_PUBLIC_KEY, vapidConfigured } from '../config/vapid.js';
import { isPushReady, sendPushToUser } from '../utils/push.js';

const router = Router();

router.get('/vapid-public-key', requireAuth, (_req, res) => {
  res.json({
    publicKey: vapidConfigured() ? VAPID_PUBLIC_KEY : null,
  });
});

function parseSubscription(body) {
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.keys?.p256dh || '').trim();
  const auth = String(body?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
    userAgent: String(body?.userAgent || '').slice(0, 240),
    updatedAt: new Date(),
  };
}

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = parseSubscription(req.body || {});
    if (!sub) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    const list = Array.isArray(req.userDoc.pushSubscriptions)
      ? [...req.userDoc.pushSubscriptions]
      : [];
    const idx = list.findIndex((s) => s.endpoint === sub.endpoint);
    if (idx >= 0) list[idx] = sub;
    else list.push(sub);
    req.userDoc.pushSubscriptions = list.slice(-8);
    await req.userDoc.save();
    res.json({ ok: true, subscribed: true });
  } catch (err) {
    console.error('[notifications/subscribe]', err);
    res.status(500).json({ error: 'Could not save subscription' });
  }
});

router.delete('/subscribe', requireAuth, async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint is required' });
    }
    req.userDoc.pushSubscriptions = (
      req.userDoc.pushSubscriptions || []
    ).filter((s) => s.endpoint !== endpoint);
    await req.userDoc.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/unsubscribe]', err);
    res.status(500).json({ error: 'Could not remove subscription' });
  }
});

router.post('/test', requireAuth, async (req, res) => {
  try {
    if (!isPushReady()) {
      return res.json({
        ok: true,
        pushed: false,
        message: 'Local device notification is enough; push is not configured.',
      });
    }
    const result = await sendPushToUser(req.user.id, {
      title: 'SchoolRun test alarm',
      body: 'Device notifications are working. Ride reminders will use this same alert.',
      tag: 'schoolrun-test',
      url: '/profile',
      requireInteraction: false,
    });
    res.json({ ok: true, pushed: result.sent > 0, sent: result.sent });
  } catch (err) {
    console.error('[notifications/test]', err);
    res.status(500).json({ error: 'Could not send test notification' });
  }
});

export default router;
