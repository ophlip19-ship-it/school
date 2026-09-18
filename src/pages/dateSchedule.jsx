import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getBookingDraft, setBookingDraft } from '../lib/booking';
import {
  SCHOOL_DAYS,
  clampRemindMinutes,
  DEFAULT_REMIND_MINUTES,
  formatLongDate,
  formatTimeLabel,
  makeSlot,
  slotKey,
  todayKey,
  upcomingWeekdays,
} from '../lib/schedule';
import {
  ensureNotificationPermission,
  getSavedRemindMinutes,
  initDeviceNotifications,
  saveRemindMinutes,
} from '../lib/notifications';
import RideCalendar from '../components/RideCalendar';
import RideReminderPicker from '../components/RideReminderPicker';

const MAX_SLOTS = 8;

export default function DateSchedule() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const draft = getBookingDraft();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(
    draft.date || todayKey(),
  );
  const [time, setTime] = useState(draft.time || '14:30');
  const [tripType, setTripType] = useState(draft.tripType || 'pickup');
  const [recurring, setRecurring] = useState(draft.recurring || []);
  const [slots, setSlots] = useState(() => {
    if (Array.isArray(draft.slots) && draft.slots.length) {
      return draft.slots.map((s) => makeSlot(s.date, s.time));
    }
    if (draft.date && draft.time) return [makeSlot(draft.date, draft.time)];
    return [];
  });
  const [remind, setRemind] = useState(draft.remind !== false);
  const [remindMinutes, setRemindMinutes] = useState(() => {
    if (draft.remindMinutes != null) {
      return clampRemindMinutes(draft.remindMinutes);
    }
    if (user?.remindMinutes != null) {
      return clampRemindMinutes(user.remindMinutes);
    }
    return getSavedRemindMinutes();
  });
  const [error, setError] = useState('');

  const minKey = todayKey();
  const selectedKeys = useMemo(
    () => slots.map((s) => s.date),
    [slots],
  );
  const marked = useMemo(() => {
    const map = {};
    slots.forEach((s) => {
      map[s.date] = (map[s.date] || 0) + 1;
    });
    return map;
  }, [slots]);

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const addSlot = (dateKey, timeValue) => {
    const key = slotKey(dateKey, timeValue);
    setSlots((prev) => {
      if (prev.some((s) => s.id === key)) return prev;
      if (prev.length >= MAX_SLOTS) {
        setError(`You can schedule up to ${MAX_SLOTS} rides at once.`);
        return prev;
      }
      setError('');
      return [...prev, makeSlot(dateKey, timeValue)].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
    });
  };

  const removeSlot = (id) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const onSelectDate = (key) => {
    setSelectedDate(key);
    addSlot(key, time);
  };

  const toggleDay = (day) => {
    setRecurring((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const applyRecurring = () => {
    if (!recurring.length) {
      setError('Pick weekdays to repeat, then apply.');
      return;
    }
    const generated = upcomingWeekdays(recurring, time, { weeks: 2 });
    setSlots((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]));
      generated.forEach((s) => {
        if (!map.has(s.id) && map.size < MAX_SLOTS) map.set(s.id, s);
      });
      if (map.size >= MAX_SLOTS && generated.length) {
        setError(`Added up to ${MAX_SLOTS} rides. Remove some to add more.`);
      } else {
        setError('');
      }
      return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
    });
  };

  const save = async () => {
    const nextSlots =
      slots.length > 0 ? slots : selectedDate && time ? [makeSlot(selectedDate, time)] : [];
    if (!nextSlots.length) {
      setError('Add at least one date and time.');
      return;
    }
    const minutes = clampRemindMinutes(remindMinutes, DEFAULT_REMIND_MINUTES);
    if (remind) {
      saveRemindMinutes(minutes);
      try {
        await ensureNotificationPermission();
        await initDeviceNotifications({ subscribeIfGranted: true });
      } catch {
        /* booking still proceeds if permission is declined */
      }
    }
    setBookingDraft({
      date: nextSlots[0].date,
      time: nextSlots[0].time,
      slots: nextSlots,
      tripType,
      recurring,
      remind,
      remindMinutes: remind ? minutes : null,
      instant: false,
    });
    navigate('/vehicle-review');
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:px-6 md:max-w-xl pb-28 lg:pb-12">
      <Link to="/pick-locations" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">
        Date &amp; schedule
      </h1>
      <p className="mt-2 text-slate-600">
        Book one ride or several at different times. Choose the alarm time
        you want — we&apos;ll use this device&apos;s notifications.
      </p>

      <div className="mt-8 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'pickup', label: 'School pickup' },
            { id: 'dropoff', label: 'School dropoff' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTripType(t.id)}
              className={`rounded-2xl border py-3 text-sm font-semibold ${
                tripType === t.id
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <RideCalendar
          year={year}
          month={month}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          selectedKeys={selectedKeys}
          marked={marked}
          onSelectDate={onSelectDate}
          minKey={minKey}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Time for {selectedDate ? formatLongDate(selectedDate) : 'this ride'}
          </label>
          <div className="flex gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => selectedDate && addSlot(selectedDate, time)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={16} /> Add
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Tap a day on the calendar or add another time for the same day.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Repeat weekdays (next 2 weeks)
          </p>
          <div className="flex flex-wrap gap-2">
            {SCHOOL_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  recurring.includes(day)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applyRecurring}
            className="mt-2 text-sm font-semibold text-emerald-700 hover:underline"
          >
            Apply {time ? formatTimeLabel(time) : 'time'} to selected weekdays
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              Scheduled rides ({slots.length})
            </p>
            {slots.length > 0 && (
              <button
                type="button"
                onClick={() => setSlots([])}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear all
              </button>
            )}
          </div>
          {slots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              No rides yet — tap a date or add a time.
            </p>
          ) : (
            <ul className="space-y-2">
              {slots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatLongDate(s.date)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatTimeLabel(s.time)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlot(s.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                    aria-label="Remove ride"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <RideReminderPicker
          enabled={remind}
          onEnabledChange={async (next) => {
            setRemind(next);
            if (next) {
              try {
                await ensureNotificationPermission();
                await initDeviceNotifications({ subscribeIfGranted: true });
              } catch {
                /* ignore */
              }
            }
          }}
          minutes={remindMinutes}
          onMinutesChange={setRemindMinutes}
          rideDate={slots[0]?.date || selectedDate}
          rideTime={slots[0]?.time || time}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        className="mt-8 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700"
      >
        {slots.length > 1
          ? `Continue with ${slots.length} rides`
          : 'Save schedule'}
      </button>
    </div>
  );
}
