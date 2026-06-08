// Shared time formatting — the single source of truth for how card times read
// across every surface (Plan board, Agenda/Day view, card detail). Always
// normalize Postgres values (which arrive as "HH:MM:SS") before formatting so
// raw seconds never leak into the UI.

/** Normalize a Postgres time ("HH:MM:SS" or "HH:MM") to "HH:MM". */
function toHHMM(t: string): string {
  return t.slice(0, 5);
}

/** Format a single time value as "9:00 AM". Accepts "HH:MM" or "HH:MM:SS". */
export function formatTimeValue(t: string | null): string {
  if (!t) return "";
  const [h, m] = toHHMM(t).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Canonical time-range string, identical on every surface:
 *   range      → "9:00 AM – 10:30 AM"
 *   start only → "9:00 AM"
 *   no start   → null
 * Period is always shown on both ends so the two surfaces read the same.
 */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = formatTimeValue(start);
  if (!end) return s;
  return `${s} – ${formatTimeValue(end)}`;
}
