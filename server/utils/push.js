import webpush from 'web-push';
import User from '../models/User.js';
import {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  vapidConfigured,
} from '../config/vapid.js';

let ready = false;

export function initPush() {
  if (!vapidConfigured()) {
    console.warn(
      '[push] VAPID keys missing — device push is off until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set',
    );
    ready = false;
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  ready = true;
  return true;
}

export function isPushReady() {
  return ready;
}

export async function sendPushToUser(userId, payload) {
  if (!ready || !userId) return { sent: 0 };
  const user = await User.findById(userId).select('pushSubscriptions');
  if (!user || !Array.isArray(user.pushSubscriptions) || !user.pushSubscriptions.length) {
    return { sent: 0 };
  }

  const body = JSON.stringify(payload || {});
  const stale = [];
  let sent = 0;

  await Promise.all(
    user.pushSubscriptions.map(async (sub) => {
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        stale.push(sub.endpoint);
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        } else {
          console.warn('[push]', err?.message || err);
        }
      }
    }),
  );

  if (stale.length) {
    user.pushSubscriptions = user.pushSubscriptions.filter(
      (s) => !stale.includes(s.endpoint),
    );
    await user.save();
  }

  return { sent };
}
