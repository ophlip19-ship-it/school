export const DEFAULT_REMIND_MINUTES = 30;
export const MAX_REMIND_MINUTES = 720;

export function clampRemindMinutes(value, fallback = DEFAULT_REMIND_MINUTES) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_REMIND_MINUTES, Math.max(0, Math.round(n)));
}

/**
 * `remind: false` or `remindMinutes: null` disables the alarm.
 * Otherwise use the provided minutes, else fallback (user default / 30).
 */
export function parseRemindMinutes(body, fallback = DEFAULT_REMIND_MINUTES) {
  if (!body || body.remind === false || body.remindMinutes === null) {
    if (body?.remind === false || body?.remindMinutes === null) return null;
  }
  if (body?.remindMinutes === undefined) return fallback;
  return clampRemindMinutes(body.remindMinutes, fallback);
}
