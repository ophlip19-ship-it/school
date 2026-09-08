import { rideDateTime, formatTimeLabel } from './schedule.js';

const STORAGE_KEY = 'schoolrun_notified_rides';

function loadNotified() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveNotified(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].slice(-80)));
  } catch {
    /* ignore */
  }
}

export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function ensureNotificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showRideNotification({ title, body, tag }) {
  if (!notificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      tag: tag || 'schoolrun-ride',
      icon: '/favicon.svg',
    });
    n.onclick = () => {
      window.focus();
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
  return showRideNotification({
    title: `Ride reminder · ${child}`,
    body:
      minutesUntil <= 1
        ? `${child}'s ride is starting now · ${ride?.pickup || 'pickup'}`
        : `${child}'s ride is in ${minutesUntil} min (${time}) · ${ride?.pickup || 'pickup'}`,
    tag: `ride-${ride?.id || ride?.date}`,
  });
}

/**
 * While the app is open, fire a local reminder ~30 minutes before each ride.
 * Returns a cleanup function.
 */
export function watchRideReminders(rides, { minutesBefore = 30 } = {}) {
  if (!Array.isArray(rides) || rides.length === 0) return () => {};

  const notified = loadNotified();
  const timers = [];
  const lead = minutesBefore * 60 * 1000;

  rides.forEach((ride) => {
    const when = rideDateTime(ride);
    if (!when) return;
    const fireAt = when.getTime() - lead;
    const delay = fireAt - Date.now();
    const key = `${ride.id || ride.date}-${ride.time}-r`;
    if (notified.has(key)) return;

    if (delay <= 0 && delay > -5 * 60 * 1000) {
      notifyScheduledRide(ride, { minutesUntil: Math.max(0, Math.round((when.getTime() - Date.now()) / 60000)) });
      notified.add(key);
      saveNotified(notified);
      return;
    }
    if (delay <= 0 || delay > 12 * 60 * 60 * 1000) return;

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
