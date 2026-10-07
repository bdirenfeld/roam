import { formatTimeValue } from "@/lib/formatTime";
import type { OpeningHoursSignal } from "@/lib/openingHours";

/**
 * Opening-hours wording for the card sheet.
 *
 * The one-line "Open 8:15 AM – 6:30 PM today" under the address and time
 * (73c7213) is gone (7 Oct 2026, delight audit, mock t04): it showed on every
 * card with known hours, as heavy as the time itself, even when the visit fit
 * easily. The week went back to a quiet "Hours" row at the bottom of the
 * sheet, and the top only speaks when the hours change the plan — see
 * `hoursClash`.
 *
 * Hours that run past midnight say so: Google writes Sesriem Canyon as
 * "6:30 AM – 6:00 AM", which read as a typo until "next day" was added, and a
 * 12:00 AM close is "midnight" (found testing live, 7 Oct 2026).
 */
function minutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

function readable(range: string): string {
  const parts = range.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return range;
  const [open, close] = parts;
  const a = minutes(open), b = minutes(close);
  if (a == null || b == null) return range;
  if (b === 0) return `${open} – midnight`;
  return b <= a ? `${open} – ${close} (next day)` : range;
}

/**
 * One day of Google's week text ("6:00 PM – 2:00 AM", "Closed", "Open 24
 * hours", split ranges "12:30 – 2:30 PM, 7:30 – 10:00 PM") as the Hours row
 * shows it: past-midnight closes say "(next day)" or "midnight".
 */
export function readableHours(value: string): string {
  const v = value.trim();
  if (/^closed$/i.test(v) || /^open\b/i.test(v)) return v;
  return v.split(/,\s*/).map(readable).join(", ");
}

/**
 * The line under the time when the hours clash with this card's plan
 * (7 Oct 2026, mock t04). `lead` is the fact, `tail` the consequence, drawn
 * lighter:
 *   closed → "Closed on Monday"
 *   opens  → "Opens 10:00 AM" + " — after you arrive"
 *   closes → "Closes 11:00 PM" + " — before you finish"
 */
export function hoursClash(signal: OpeningHoursSignal): { lead: string; tail: string } {
  if (signal.kind === "closed") return { lead: `Closed on ${signal.weekday}`, tail: "" };
  if (signal.kind === "opens") return { lead: `Opens ${formatTimeValue(signal.opensAt)}`, tail: " — after you arrive" };
  const at = signal.closesAt === "00:00" ? "at midnight" : formatTimeValue(signal.closesAt);
  return { lead: `Closes ${at}`, tail: " — before you finish" };
}
