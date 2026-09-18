import { Bell } from 'lucide-react';
import {
  REMIND_PRESETS,
  alarmTimeFromRide,
  clampRemindMinutes,
  formatRemindLead,
  formatTimeLabel,
  minutesBeforeFromAlarm,
} from '../lib/schedule';
import NotificationSettings from './NotificationSettings';

export default function RideReminderPicker({
  enabled,
  onEnabledChange,
  minutes,
  onMinutesChange,
  rideDate,
  rideTime,
  showDeviceSettings = true,
  compact = false,
  hideToggle = false,
}) {
  const lead = clampRemindMinutes(minutes, 0);
  const alarmTime =
    rideDate && rideTime
      ? alarmTimeFromRide(rideDate, rideTime, lead)
      : '';

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        enabled
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-slate-200 bg-white'
      }`}
    >
      {hideToggle ? (
        <div className="flex items-start gap-3">
          <Bell size={18} className="mt-0.5 shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">
              Default reminder · {formatRemindLead(lead)}
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Applied to new scheduled rides. You can still pick a different
              alarm time when booking.
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onEnabledChange?.(!enabled)}
          className="flex w-full items-start gap-3 text-left"
        >
          <Bell
            size={18}
            className={`mt-0.5 shrink-0 ${enabled ? 'text-emerald-700' : 'text-slate-400'}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">
              {enabled
                ? `Reminder alarm · ${formatRemindLead(lead)}`
                : 'Reminder alarm off'}
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              {enabled
                ? 'Uses this device’s notification settings. Pick how early to alert you.'
                : 'Turn on to get a device notification before pickup.'}
            </span>
          </span>
          <span
            className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              enabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            aria-hidden
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      )}

      {enabled ? (
        <div className="mt-3 space-y-3 border-t border-emerald-100 pt-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Remind me
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REMIND_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onMinutesChange?.(n)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    lead === n
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  {n < 60 ? `${n} min` : n === 60 ? '1 hour' : `${n / 60}h`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onMinutesChange?.(0)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  lead === 0
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                At pickup
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Custom minutes before
            </span>
            <input
              type="number"
              min={0}
              max={720}
              step={5}
              value={lead}
              onChange={(e) =>
                onMinutesChange?.(clampRemindMinutes(e.target.value, 0))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-600/30 focus:ring-2"
            />
          </label>

          {!compact && rideDate && rideTime && alarmTime ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Alarm time
              </span>
              <input
                type="time"
                value={alarmTime}
                onChange={(e) =>
                  onMinutesChange?.(
                    minutesBeforeFromAlarm(rideDate, rideTime, e.target.value),
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-600/30 focus:ring-2"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Pickup at {formatTimeLabel(rideTime)} · alarm at{' '}
                {formatTimeLabel(alarmTime)} ({formatRemindLead(lead)}).
              </p>
            </label>
          ) : null}

          {showDeviceSettings ? (
            <NotificationSettings compact />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
