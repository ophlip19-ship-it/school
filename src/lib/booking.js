const KEY = 'schoolrun_booking_draft';

export function getBookingDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function setBookingDraft(partial) {
  const next = { ...getBookingDraft(), ...partial };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearBookingDraft() {
  sessionStorage.removeItem(KEY);
}
