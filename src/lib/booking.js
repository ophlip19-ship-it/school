/**
 * Booking draft survives full page refresh (localStorage).
 * Previously sessionStorage-only, which still survives refresh in-tab,
 * but localStorage is more durable across reloads and some mobile browsers.
 */
const KEY = 'schoolrun_booking_draft';

export function getBookingDraft() {
  try {
    // Prefer localStorage; migrate any leftover sessionStorage draft once
    const raw =
      localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || '{}';
    const parsed = JSON.parse(raw);
    if (sessionStorage.getItem(KEY) && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, raw);
      sessionStorage.removeItem(KEY);
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setBookingDraft(partial) {
  const next = { ...getBookingDraft(), ...partial };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    sessionStorage.removeItem(KEY);
  } catch {
    /* quota / private mode — still return next for in-memory use */
  }
  return next;
}

export function clearBookingDraft() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
