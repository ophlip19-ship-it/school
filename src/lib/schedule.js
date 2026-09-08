const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SCHOOL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function parseDateKey(key) {
  const [y, m, d] = String(key || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function weekdayShort(dateOrKey) {
  const d =
    dateOrKey instanceof Date ? dateOrKey : parseDateKey(dateOrKey);
  if (!d) return '';
  return WEEKDAYS[d.getDay()];
}

export function formatLongDate(dateOrKey) {
  const d =
    dateOrKey instanceof Date ? dateOrKey : parseDateKey(dateOrKey);
  if (!d) return String(dateOrKey || '');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimeLabel(time) {
  const [hh, mm] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hh)) return String(time || '');
  const date = new Date();
  date.setHours(hh, mm || 0, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Combine YYYY-MM-DD + HH:MM into a local Date. */
export function rideDateTime(ride) {
  const key = ride?.date || ride?.rideDate;
  const time = ride?.time || ride?.rideTime || '00:00';
  const d = parseDateKey(key);
  if (!d) return null;
  const [hh, mm] = String(time).split(':').map(Number);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

export function slotKey(date, time) {
  return `${date}|${time}`;
}

export function makeSlot(date, time) {
  return { id: slotKey(date, time), date, time };
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      day,
      date,
      key: toDateKey(date),
      weekday: WEEKDAYS[date.getDay()],
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthTitle(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Next `weeks` occurrences of the given weekday shorts (Mon..Fri). */
export function upcomingWeekdays(days, time, { weeks = 2, from = new Date() } = {}) {
  const wanted = new Set(days || []);
  if (!wanted.size) return [];
  const slots = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);
  for (let cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getTime() === start.getTime() && cursor.getHours() === 0) {
      // skip today if the chosen time already passed
      const [hh, mm] = String(time || '00:00').split(':').map(Number);
      const todayAt = new Date();
      todayAt.setHours(hh || 0, mm || 0, 0, 0);
      if (toDateKey(cursor) === toDateKey(new Date()) && todayAt.getTime() <= Date.now()) {
        continue;
      }
    }
    if (wanted.has(WEEKDAYS[cursor.getDay()])) {
      slots.push(makeSlot(toDateKey(cursor), time));
    }
  }
  return slots;
}

function icsStamp(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}${m}${d}T${hh}${mm}${ss}`;
}

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function rideCalendarTitle(ride) {
  const child = ride?.childName || 'Child';
  const kind =
    ride?.tripType === 'pickup' ? 'school pickup' : 'school dropoff';
  return `SchoolRun · ${child} ${kind}`;
}

export function buildRideIcs(ride, { alarmMinutes = 30 } = {}) {
  const start = rideDateTime(ride);
  if (!start) return '';
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const uid = `${ride.id || ride.date + ride.time}@schoolrun`;
  const title = rideCalendarTitle(ride);
  const desc = `${ride.pickup || ''} → ${ride.dropoff || ''}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SchoolRun//Ride Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    `LOCATION:${icsEscape(ride.pickup || '')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`Reminder: ${title}`)}`,
    `TRIGGER:-PT${Math.max(1, alarmMinutes)}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function downloadRideIcs(ride) {
  const ics = buildRideIcs(ride);
  if (!ics) return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schoolrun-${ride.childName || 'ride'}-${ride.date || 'trip'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(ride) {
  const start = rideDateTime(ride);
  if (!start) return '';
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const dates = `${icsStamp(start)}/${icsStamp(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: rideCalendarTitle(ride),
    dates,
    details: `${ride.pickup || ''} → ${ride.dropoff || ''}`,
    location: ride.pickup || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
