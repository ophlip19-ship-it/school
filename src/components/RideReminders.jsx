import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ridesApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import {
  dismissNotificationBanner,
  initDeviceNotifications,
  notificationBannerDismissed,
  notificationPermission,
  notifyScheduledRide,
  openDeviceNotificationSettings,
  showRideNotification,
  subscribePermissionChanges,
  watchRideReminders,
} from '../lib/notifications';

/** Listens for server ride reminders and schedules local device alarms. */
export default function RideReminders() {
  const { isAuthenticated, user } = useAuth();
  const isParent = isAuthenticated && user?.role === 'parent';
  const [permission, setPermission] = useState(notificationPermission);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    setPermission(notificationPermission());
    return subscribePermissionChanges((next) => setPermission(next));
  }, []);

  useEffect(() => {
    if (!isParent) return undefined;
    if (notificationBannerDismissed()) return undefined;
    if (permission === 'granted' || permission === 'unsupported') return undefined;
    setShowBanner(true);
    return undefined;
  }, [isParent, permission]);

  useEffect(() => {
    if (!isParent) return undefined;
    const socket = getSocket();
    let stopWatch = () => {};
    let cancelled = false;

    const onReminder = (payload) => {
      notifyScheduledRide(payload, {
        minutesUntil: payload?.minutesUntil ?? payload?.remindMinutes ?? 30,
      });
    };
    const onActivated = (payload) => {
      showRideNotification({
        title: `Ride is live · ${payload?.childName || 'Child'}`,
        body: `Finding a driver for ${payload?.time || 'the scheduled pickup'}.`,
        tag: `activated-${payload?.rideId}`,
        url: payload?.rideId
          ? `/live-tracking?rideId=${payload.rideId}`
          : '/dashboard',
        rideId: payload?.rideId,
      });
    };

    if (socket) {
      socket.on('ride:reminder', onReminder);
      socket.on('ride:activated', onActivated);
    }

    const load = async () => {
      await initDeviceNotifications({
        subscribeIfGranted: permission === 'granted',
      });
      try {
        const res = await ridesApi.active();
        if (cancelled) return;
        const scheduled = Array.isArray(res.scheduled) ? res.scheduled : [];
        stopWatch();
        stopWatch = watchRideReminders(scheduled);
      } catch {
        /* ignore */
      }
    };

    load();
    const t = setInterval(load, 60 * 1000);

    return () => {
      cancelled = true;
      stopWatch();
      clearInterval(t);
      if (socket) {
        socket.off('ride:reminder', onReminder);
        socket.off('ride:activated', onActivated);
      }
    };
  }, [isParent, permission]);

  if (!isParent || !showBanner) return null;

  const blocked = permission === 'denied';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[45] flex justify-center px-3 lg:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Bell size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {blocked ? 'Ride alarms are blocked' : 'Turn on ride reminder alarms'}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {blocked
              ? 'Allow SchoolRun in this device’s notification settings so you don’t miss pickup.'
              : 'Choose your alarm time when you schedule a ride. We’ll use this device’s notifications.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await openDeviceNotificationSettings();
                setPermission(notificationPermission());
              }}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              {blocked ? 'Device settings' : 'Allow notifications'}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            dismissNotificationBanner();
            setShowBanner(false);
          }}
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
