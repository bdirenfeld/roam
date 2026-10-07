/**
 * Every day of an upcoming journey saved to the phone (7 Oct 2026, offline).
 *
 * The service worker (public/sw.js) only kept the pages a person had already
 * opened, under their full URL. The Day view's neighbour preloads land under
 * Next's `_rsc` keys, which a plain offline navigation never matches, so a
 * day you hadn't opened was simply missing in airplane mode.
 *
 * Now, when a member opens an upcoming journey online — it starts within 30
 * days, or is under way — the page posts every day's URL to the service
 * worker, which fetches each one and keeps it under its plain URL. At most
 * once per 12 hours per journey on this device (a localStorage timestamp).
 * Storage that can't be read or written: nothing is sent, rather than every
 * open sending a dozen page loads.
 *
 * Dates are calendar days ("YYYY-MM-DD") as UTC day numbers; `todayISO` is the
 * reader's LOCAL date (lib/isSameLocalDay `localDate`).
 */

const DAY_MS = 86_400_000;
export const SAVE_AHEAD_DAYS = 30;
export const SAVE_EVERY_MS = 12 * 60 * 60 * 1000;
export const SAVE_DAYS_MESSAGE = "roam:save-days";

export interface SaveDaysMessage {
  type: typeof SAVE_DAYS_MESSAGE;
  tripId: string;
  /** Every day, in date order: its plain URL and date (the SW picks today's for /trips/{id} offline). */
  days: { url: string; date: string }[];
}

function dayNumber(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS) : null;
}

/** Starts within 30 days, or is under way today. Past journeys and far-off ones are not. */
export function isUpcoming(start: string | null | undefined, end: string | null | undefined, todayISO: string): boolean {
  const s = dayNumber(start), t = dayNumber(todayISO);
  if (s === null || t === null) return false;
  const e = dayNumber(end) ?? s;
  return s - t <= SAVE_AHEAD_DAYS && t <= e;
}

export function savedKey(tripId: string): string {
  return `roam_days_saved_${tripId}`;
}

/** The message for the service worker, or null when there is nothing to do. */
export function saveDaysMessage(input: {
  tripId: string;
  start: string | null | undefined;
  end: string | null | undefined;
  todayISO: string;
  days: { id: string; date: string }[];
  /** When this device last sent it (ms), null if never. */
  lastSaved: number | null;
  now: number;
}): SaveDaysMessage | null {
  if (!input.days.length || !isUpcoming(input.start, input.end, input.todayISO)) return null;
  if (input.lastSaved !== null && input.now - input.lastSaved < SAVE_EVERY_MS && input.now >= input.lastSaved) return null;
  const days = [...input.days]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => ({ url: `/trips/${input.tripId}/days/${d.id}`, date: d.date }));
  return { type: SAVE_DAYS_MESSAGE, tripId: input.tripId, days };
}

/**
 * Read the last-sent time. `undefined` means storage is unusable (send nothing);
 * null means never sent.
 */
export function readSaved(store: Storage | null, tripId: string): number | null | undefined {
  if (!store) return undefined;
  try {
    const raw = store.getItem(savedKey(tripId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return undefined;
  }
}

/** Remember the send. False when storage refused it (then the caller does not send). */
export function writeSaved(store: Storage | null, tripId: string, now: number): boolean {
  if (!store) return false;
  try {
    store.setItem(savedKey(tripId), String(now));
    return true;
  } catch {
    return false;
  }
}
