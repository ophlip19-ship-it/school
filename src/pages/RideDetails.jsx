import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { formatMoney, ridesApi } from '../lib/api';
import {
  clampRemindMinutes,
  downloadRideIcs,
  formatRemindLead,
  googleCalendarUrl,
} from '../lib/schedule';
import RideReminderPicker from '../components/RideReminderPicker';

export default function RideDetails() {
  const { state } = useLocation();
  const [ride, setRide] = useState(state);
  const [remindEnabled, setRemindEnabled] = useState(
    state?.remindMinutes != null,
  );
  const [remindMinutes, setRemindMinutes] = useState(
    state?.remindMinutes != null ? clampRemindMinutes(state.remindMinutes) : 30,
  );
  const [remindSaving, setRemindSaving] = useState(false);
  const [remindError, setRemindError] = useState('');
  const [remindMessage, setRemindMessage] = useState('');

  if (!ride) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6 sm:px-6">
        <p className="text-slate-600">No ride selected.</p>
        <Link to="/history" className="mt-4 inline-block text-emerald-600">
          ← History
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:px-6 md:max-w-xl pb-28 lg:pb-12">
      <Link to="/history" className="text-sm font-medium text-emerald-600">
        ← History
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">Ride details</h1>

      <div className="mt-8 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {[
          ['Child', ride.childName],
          ['Type', ride.tripType],
          ['Date', `${ride.date} · ${ride.time}`],
          ['Pickup', ride.pickup],
          ['Drop-off', ride.dropoff],
          ['Driver', ride.driverName || 'Unassigned'],
          ['Vehicle', ride.vehiclePlate || '—'],
          ['Status', ride.status],
          ['Payment', ride.paymentStatus],
          ['Fare', formatMoney(ride.fareCents)],
          ['Handover PIN', ride.handoverPin],
          [
            'Reminder',
            ride.remindMinutes != null
              ? formatRemindLead(ride.remindMinutes)
              : 'Off',
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0"
          >
            <span className="text-sm text-slate-500">{label}</span>
            <span className="max-w-[60%] text-right font-medium capitalize text-slate-900">
              {String(value ?? '—').replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {['scheduled', 'pending_payment'].includes(ride.status) ? (
        <div className="mt-6 space-y-3">
          <RideReminderPicker
            enabled={remindEnabled}
            onEnabledChange={setRemindEnabled}
            minutes={remindMinutes}
            onMinutesChange={setRemindMinutes}
            rideDate={ride.date}
            rideTime={ride.time}
          />
          <button
            type="button"
            disabled={remindSaving}
            onClick={async () => {
              setRemindSaving(true);
              setRemindError('');
              setRemindMessage('');
              try {
                const { ride: updated } = await ridesApi.updateReminder(ride.id, {
                  remind: remindEnabled,
                  remindMinutes: remindEnabled ? remindMinutes : null,
                });
                setRide(updated);
                setRemindMessage('Reminder alarm updated.');
              } catch (err) {
                setRemindError(err.message || 'Could not update reminder');
              } finally {
                setRemindSaving(false);
              }
            }}
            className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {remindSaving ? 'Saving…' : 'Save reminder alarm'}
          </button>
          {remindMessage ? (
            <p className="text-sm text-emerald-700">{remindMessage}</p>
          ) : null}
          {remindError ? (
            <p className="text-sm text-red-700">{remindError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => downloadRideIcs(ride)}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800"
          >
            <CalendarPlus size={16} /> Save .ics
          </button>
          <a
            href={googleCalendarUrl(ride)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800"
          >
            Google Calendar
          </a>
        </div>
        {ride.paymentStatus === 'paid' &&
          ride.status !== 'scheduled' &&
          ride.status !== 'pending_payment' && (
          <>
            <Link
              to={`/live-tracking?rideId=${ride.id}`}
              className="block w-full rounded-2xl bg-emerald-600 py-4 text-center font-semibold text-white"
            >
              Track live
            </Link>
            <Link
              to={`/chat?rideId=${ride.id}`}
              className="block w-full rounded-2xl border border-slate-200 bg-white py-4 text-center font-semibold text-slate-800"
            >
              Open chat
            </Link>
          </>
        )}
        {ride.paymentStatus !== 'paid' && (
          <Link
            to={`/payment?rideId=${ride.id}`}
            className="block w-full rounded-2xl bg-emerald-600 py-4 text-center font-semibold text-white"
          >
            Complete payment
          </Link>
        )}
      </div>
    </div>
  );
}
