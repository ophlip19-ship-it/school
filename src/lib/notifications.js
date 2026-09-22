import {
  rideDateTime,
  formatTimeLabel,
  clampRemindMinutes,
  DEFAULT_REMIND_MINUTES,
} from './schedule.js';
import { notificationsApi } from './api.js';

const NOTIFIED_KEY = 'schoolrun_notified_rides';
const REMIND_MINUTES_KEY = 'schoolrun_remind_minutes';
const BANNER_DISMISS_KEY = 'schoolrun_notif_banner_dismissed';
const SW_URL = '/sw.js';

let swRegistrationPromise = null;
let permissionListeners = new Set();

function loadNotified() {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveNotified(set) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-80)));
  } catch {
    /* ignore */
  }
}

export function getSavedRemindMinutes() {
  try {
    const n = Number(localStorage.getItem(REMIND_MINUTES_KEY));
    if (Number.isFinite(n)) return clampRemindMinutes(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_REMIND_MINUTES;
}

export function saveRemindMinutes(minutes) {
  try {
    localStorage.setItem(
      REMIND_MINUTES_KEY,
      String(clampRemindMinutes(minutes)),
    );
  } catch {
    /* ignore */
  }
}

export function notificationBannerDismissed() {
  try {
    return sessionStorage.getItem(BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissNotificationBanner() {
  try {
    sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function pushSupported() {
  return (
    serviceWorkerSupported() &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function subscribePermissionChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
}

function emitPermission(status) {
  permissionListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      /* ignore */
    }
  });
}

function watchPermissionsApi() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return;
  }
  navigator.permissions
    .query({ name: 'notifications' })
    .then((status) => {
      status.onchange = () => emitPermission(notificationPermission());
    })
    .catch(() => {});
}

if (typeof window !== 'undefined') {
  watchPermissionsApi();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      emitPermission(notificationPermission());
    }
  });
}

export async function ensureNotificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') {
    emitPermission('granted');
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    emitPermission('denied');
    return 'denied';
  }
  try {
    const result = await Notification.requestPermission();
    emitPermission(result);
    return result;
  } catch {
    const result = Notification.permission;
    emitPermission(result);
    return result;
  }
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator?.standalone === true
  );
}

export function getNotificationPlatform() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  return {
    isIOS,
    isAndroid: /Android/i.test(ua),
    isWin: /Windows/i.test(ua),
    isMac: /Mac OS X/i.test(ua) && !isIOS,
    isChrome: /Chrome|CriOS/i.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua),
    isEdge: /Edg/i.test(ua),
    isFirefox: /Firefox|FxiOS/i.test(ua),
    isSafari: /Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua),
    standalone: isStandalonePwa(),
  };
}

export function getDeviceNotificationGuidance() {
  const p = getNotificationPlatform();

  if (p.isAndroid) {
    return {
      platform: 'android',
      heading: 'Allow SchoolRun in this phone’s notification settings',
      steps: p.standalone
        ? [
            'Tap Device settings to open this app’s notification page',
            'Turn notifications on for SchoolRun',
            'Return here — the status updates automatically',
          ]
        : [
            'Tap Device settings (or open Android Settings)',
            'Apps → Chrome (or the browser you used) → Notifications',
            'Allow notifications for this site',
            'Come back to SchoolRun; status should show Allowed',
          ],
    };
  }
  if (p.isIOS) {
    return {
      platform: 'ios',
      heading: 'Allow SchoolRun in iPhone notification settings',
      steps: p.standalone
        ? [
            'Tap Device settings to open SchoolRun’s iOS settings',
            'Turn Allow Notifications on',
            'Reopen SchoolRun',
          ]
        : [
            'Share → Add to Home Screen (required for iPhone alerts)',
            'Open the Home Screen icon, then tap Allow when asked',
            'Or Settings → Notifications → Safari / SchoolRun → Allow',
          ],
    };
  }
  if (p.isWin) {
    return {
      platform: 'windows',
      heading: 'Allow SchoolRun in Windows notification settings',
      steps: [
        'Tap Device settings to open Windows Notifications',
        'Or click the lock icon in the address bar → Notifications → Allow',
        'Return here and send a test alarm',
      ],
    };
  }
  if (p.isMac) {
    return {
      platform: 'mac',
      heading: 'Allow SchoolRun in Mac notification settings',
      steps: [
        'Click the lock icon in the address bar',
        'Set Notifications to Allow',
        'Or System Settings → Notifications → your browser → Allow',
      ],
    };
  }
  return {
    platform: 'other',
    heading: 'Allow notifications for this site',
    steps: [
      'Click the lock or site-settings icon in the address bar',
      'Set Notifications to Allow',
      'Reload this page',
    ],
  };
}

function clickProtocolLink(href) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Uses the real device/browser notification permission when still undecided.
 * If already blocked, opens OS notification settings where the platform
 * allows it (Android intents, iOS app-settings, Windows ms-settings).
 */
export async function openDeviceNotificationSettings() {
  const before = notificationPermission();

  if (before === 'unsupported') {
    return { permission: before, opened: false, method: 'unsupported' };
  }

  // Native system prompt — this is the device notification permission dialog.
  if (before === 'default') {
    const result = await ensureNotificationPermission();
    if (result === 'granted') {
      await initDeviceNotifications({ subscribeIfGranted: true });
    }
    return {
      permission: result,
      opened: result !== 'default',
      method: 'prompt',
    };
  }

  const p = getNotificationPlatform();
  let opened = false;
  let method = 'instructions';

  try {
    if (p.isIOS && p.standalone) {
      window.location.href = 'app-settings:';
      opened = true;
      method = 'app-settings';
    } else if (p.isAndroid) {
      const pkg = p.isFirefox
        ? 'org.mozilla.firefox'
        : p.isEdge
          ? 'com.microsoft.emmx'
          : 'com.android.chrome';
      clickProtocolLink(
        `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${pkg};end`,
      );
      opened = true;
      method = 'android-intent';
    } else if (p.isWin) {
      clickProtocolLink('ms-settings:notifications');
      opened = true;
      method = 'ms-settings';
    }
  } catch {
    opened = false;
    method = 'instructions';
  }

  return {
    permission: notificationPermission(),
    opened,
    method,
  };
}

export async function registerNotificationWorker() {
  if (!serviceWorkerSupported()) return null;
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register(SW_URL)
      .catch((err) => {
        swRegistrationPromise = null;
        console.warn('[notifications] service worker register failed', err);
        return null;
      });
  }
  return swRegistrationPromise;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribePush() {
  if (!pushSupported()) return null;
  if (notificationPermission() !== 'granted') return null;
  const registration = await registerNotificationWorker();
  if (!registration?.pushManager) return null;

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await notificationsApi.subscribe(existing.toJSON());
      return existing;
    }
    const { publicKey } = await notificationsApi.vapidKey();
    if (!publicKey) return null;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await notificationsApi.subscribe(subscription.toJSON());
    return subscription;
  } catch (err) {
    console.warn('[notifications] push subscribe failed', err);
    return null;
  }
}

export async function unsubscribePush() {
  if (!pushSupported()) return;
  try {
    const registration = await registerNotificationWorker();
    const existing = await registration?.pushManager?.getSubscription();
    if (existing) {
      try {
        await notificationsApi.unsubscribe({ endpoint: existing.endpoint });
      } catch {
        /* ignore */
      }
      await existing.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}

export async function initDeviceNotifications({ subscribeIfGranted = true } = {}) {
  await registerNotificationWorker();
  if (subscribeIfGranted && notificationPermission() === 'granted') {
    await subscribePush();
  }
  return notificationPermission();
}

function notificationOptions({ body, tag, url, rideId, requireInteraction = true }) {
  return {
    body: body || '',
    tag: tag || 'schoolrun-ride',
    icon: '/product-logo.png',
    badge: '/product-logo.png',
    vibrate: [200, 80, 200, 80, 400],
    renotify: true,
    requireInteraction,
    silent: false,
    data: {
      url: url || '/dashboard',
      rideId: rideId || null,
    },
  };
}

export async function showRideNotification({
  title,
  body,
  tag,
  url,
  rideId,
  requireInteraction = true,
}) {
  if (!notificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const opts = notificationOptions({
    body,
    tag,
    url,
    rideId,
    requireInteraction,
  });

  try {
    const registration =
      (await registerNotificationWorker()) ||
      (serviceWorkerSupported() ? await navigator.serviceWorker.ready.catch(() => null) : null);
    if (registration?.showNotification) {
      await registration.showNotification(title || 'SchoolRun', opts);
      return true;
    }
  } catch {
    /* fall through to Notification constructor */
  }

  try {
    const n = new Notification(title || 'SchoolRun', opts);
    n.onclick = () => {
      window.focus();
      if (url) {
        try {
          window.location.assign(url);
        } catch {
          /* ignore */
        }
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function notifyScheduledRide(ride, { minutesUntil = 30 } = {}) {
  const child = ride?.childName || 'Your child';
  const time = formatTimeLabel(ride?.time);
  const rideId = ride?.id || ride?.rideId;
  return showRideNotification({
    title: `Ride reminder · ${child}`,
    body:
      minutesUntil <= 1
        ? `${child}'s ride is starting now · ${ride?.pickup || 'pickup'}`
        : `${child}'s ride is in ${minutesUntil} min (${time}) · ${ride?.pickup || 'pickup'}`,
    tag: `ride-${rideId || ride?.date}`,
    url: rideId ? `/live-tracking?rideId=${rideId}` : '/dashboard',
    rideId,
  });
}

/**
 * While the app is open, fire a local reminder at each ride's chosen lead time.
 * Returns a cleanup function.
 */
export function watchRideReminders(rides) {
  if (!Array.isArray(rides) || rides.length === 0) return () => {};

  const notified = loadNotified();
  const timers = [];

  rides.forEach((ride) => {
    if (ride?.remindMinutes == null) return;
    const minutesBefore = clampRemindMinutes(ride.remindMinutes, DEFAULT_REMIND_MINUTES);
    const when = rideDateTime(ride);
    if (!when) return;
    const fireAt = when.getTime() - minutesBefore * 60 * 1000;
    const delay = fireAt - Date.now();
    const key = `${ride.id || ride.date}-${ride.time}-r${minutesBefore}`;
    if (notified.has(key)) return;

    if (delay <= 0 && delay > -5 * 60 * 1000) {
      notifyScheduledRide(ride, {
        minutesUntil: Math.max(
          0,
          Math.round((when.getTime() - Date.now()) / 60000),
        ),
      });
      notified.add(key);
      saveNotified(notified);
      return;
    }
    if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return;

    const t = setTimeout(() => {
      notifyScheduledRide(ride, { minutesUntil: minutesBefore });
      notified.add(key);
      saveNotified(notified);
    }, delay);
    timers.push(t);
  });

  return () => {
    timers.forEach((t) => clearTimeout(t));
  };
}

export async function sendTestNotification() {
  const perm = await ensureNotificationPermission();
  if (perm !== 'granted') return { ok: false, permission: perm };
  await subscribePush();
  const shown = await showRideNotification({
    title: 'SchoolRun reminders are on',
    body: 'You will get a device notification at the alarm time you pick for each ride.',
    tag: 'schoolrun-test',
    url: '/profile',
    requireInteraction: false,
  });
  try {
    await notificationsApi.test();
  } catch {
    /* local notification is enough if push is unavailable */
  }
  return { ok: shown, permission: perm };
}
