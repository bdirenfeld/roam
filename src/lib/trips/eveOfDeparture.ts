/**
 * Eve of departure (7 Oct 2026, delight audit, mock d11 approved): the day
 * before a journey starts, the organiser's first open of it shows the app's
 * one toast, once per journey on that device:
 *
 *   "Lisbon tomorrow · all booked ✓"       every Bookings row booked or not needed
 *   "Lisbon tomorrow · 2 still to book"    + a "Bookings" button that opens the sheet
 *
 * The rows are the Bookings checklist's own (lib/booking/checklist
 * checklistRows), so the toast and the sheet never disagree.
 *
 * Dates are calendar days ("YYYY-MM-DD") counted as UTC dates (see
 * lib/trips/welcomeHome). `todayISO` is the reader's LOCAL date
 * (lib/isSameLocalDay `localDate`).
 */

const DAY_MS = 86_400_000;

function dayNumber(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS) : null;
}

/** Is today the day before the journey's first day? */
export function isEveOfDeparture(start: string | null | undefined, todayISO: string): boolean {
  const s = dayNumber(start), t = dayNumber(todayISO);
  return s !== null && t !== null && s - t === 1;
}

/** The localStorage key that remembers the toast was shown for this journey on this device. */
export function eveKey(tripId: string): string {
  return `roam_eve_shown_${tripId}`;
}

/** "Lisbon, Portugal" → "Lisbon". */
export function eveTown(destination: string): string {
  return destination.split(",")[0].trim() || destination.trim();
}

/** How many Bookings rows are still to book (neither booked nor not needed). */
export function stillToBook(rows: { state: "booked" | "skip" | "open" }[]): number {
  return rows.filter((r) => r.state === "open").length;
}

export function eveMessage(destination: string, open: number): string {
  const town = eveTown(destination);
  return open > 0 ? `${town} tomorrow · ${open} still to book` : `${town} tomorrow · all booked ✓`;
}

/**
 * Claim the one showing for this journey on this device. True means "show it
 * now" and the device remembers; false means it was shown before, or storage
 * can't be read or written (then it never shows, rather than every time).
 */
export function claimEve(store: Storage | null, tripId: string): boolean {
  if (!store) return false;
  try {
    if (store.getItem(eveKey(tripId))) return false;
    store.setItem(eveKey(tripId), "1");
    return true;
  } catch {
    return false;
  }
}

/** Shown before? (Read only: the data load runs only when this is false.) */
export function eveSeen(store: Storage | null, tripId: string): boolean {
  if (!store) return true;
  try {
    return store.getItem(eveKey(tripId)) !== null;
  } catch {
    return true;
  }
}
