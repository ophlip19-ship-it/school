import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, ExternalLink, ShieldCheck } from 'lucide-react';
import {
  ensureNotificationPermission,
  getDeviceNotificationGuidance,
  initDeviceNotifications,
  notificationPermission,
  notificationSupported,
  openDeviceNotificationSettings,
  sendTestNotification,
  subscribePermissionChanges,
  subscribePush,
} from '../lib/notifications';

const LABELS = {
  granted: 'Allowed on this device',
  denied: 'Blocked in device settings',
  default: 'Not enabled yet',
  unsupported: 'Not supported on this browser',
};

export default function NotificationSettings({ compact = false }) {
  const [permission, setPermission] = useState(notificationPermission);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const guidance = getDeviceNotificationGuidance();

  useEffect(() => {
    setPermission(notificationPermission());
    return subscribePermissionChanges((next) => setPermission(next));
  }, []);

  const allow = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await ensureNotificationPermission();
      setPermission(result);
      if (result === 'granted') {
        await initDeviceNotifications({ subscribeIfGranted: true });
        await subscribePush();
        setMessage('Device notifications are on. You will get ride alarms on this device.');
      } else if (result === 'denied') {
        setError(
          'This browser blocked notifications. Use device settings below to allow them, then return here.',
        );
      }
    } catch (err) {
      setError(err.message || 'Could not request notification permission');
    } finally {
      setBusy(false);
    }
  };

  const openSettings = async () => {
    setBusy(true);
    setError('');
    try {
      await openDeviceNotificationSettings();
      setPermission(notificationPermission());
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await sendTestNotification();
      setPermission(result.permission);
      if (result.ok) {
        setMessage('Test alarm sent. Check your device notification shade.');
      } else if (result.permission === 'denied') {
        setError('Notifications are blocked. Allow them in device settings first.');
      } else {
        setError('Could not show a notification. Allow access and try again.');
      }
    } catch (err) {
      setError(err.message || 'Test notification failed');
    } finally {
      setBusy(false);
    }
  };

  if (!notificationSupported()) {
    return (
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
        This browser does not support device notifications.
      </p>
    );
  }

  const Icon =
    permission === 'granted'
      ? BellRing
      : permission === 'denied'
        ? BellOff
        : Bell;

  return (
    <div
      className={
        compact
          ? 'rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-emerald-100'
          : 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5'
      }
    >
      {!compact ? (
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon size={18} />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">Device notifications</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Ride reminder alarms use this phone or computer’s notification settings.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            permission === 'granted'
              ? 'bg-emerald-100 text-emerald-800'
              : permission === 'denied'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {permission === 'granted' ? <ShieldCheck size={12} /> : <Icon size={12} />}
          {LABELS[permission] || permission}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {permission !== 'granted' ? (
          <button
            type="button"
            onClick={allow}
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Allow notifications'}
          </button>
        ) : (
          <button
            type="button"
            onClick={test}
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send test alarm'}
          </button>
        )}
        <button
          type="button"
          onClick={openSettings}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <ExternalLink size={12} /> Device settings
        </button>
      </div>

      {permission === 'denied' || (!compact && permission !== 'granted') ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">{guidance.heading}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
            {guidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {message ? (
        <p className="mt-2 text-xs font-medium text-emerald-700">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-medium text-amber-800">{error}</p>
      ) : null}
    </div>
  );
}
