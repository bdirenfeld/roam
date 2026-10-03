import type { ParsedConfirmation } from "./toCards";

/**
 * A booking dated outside the journey (3 Oct 2026). Brennan's ruling: keep it,
 * put it on the nearest day, and say so in one plain line with a tap that
 * extends the journey to its real day. Until then the check sheet quietly put
 * any date it could not find on Day 1 — a flight home the day after the trip
 * ended landed on the first morning — and a check-out after the last day left
 * no check-out card at all.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const t0 = (d: string) => Date.parse(d + "T00:00:00Z");
const isoDate = (v: string | null | undefined) => (typeof v === "string" && ISO.test(v.trim()) ? v.trim() : null);

export type Outside =
  | { side: "none" }
  | { side: "before" | "after"; days: number; nearest: string; extendTo: string };

/** Where one date sits against the journey's first and last day. A missing date is "none". */
export function outsideDates(start: string | null, end: string | null, date: string | null | undefined): Outside {
  const d = isoDate(date), s = isoDate(start), e = isoDate(end);
  if (!d || !s || !e) return { side: "none" };
  if (d < s) return { side: "before", days: Math.round((t0(s) - t0(d)) / DAY), nearest: s, extendTo: d };
  if (d > e) return { side: "after", days: Math.round((t0(d) - t0(e)) / DAY), nearest: e, extendTo: d };
  return { side: "none" };
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon 23 Aug". Spelled out by hand: newer ICU writes September as "Sept" in en-GB, and browsers differ. */
export function shortDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MO[m - 1]}`;
}

/** "AC890" reads "AC 890"; anything else as it came. */
function flightName(p: ParsedConfirmation): string {
  const n = (p.flight_number ?? "").replace(/\s+/g, "").toUpperCase();
  const m = n.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return n || p.title?.trim() || "This flight";
}

/** The booking's events that carry a date, each said as a person would. */
function events(p: ParsedConfirmation): { date: string | null; said: string }[] {
  const name = p.title?.trim() || "This booking";
  if (p.type === "flight_arrival" || p.type === "flight_departure") {
    // The reader's `date` is the day the flight leaves.
    return [{ date: isoDate(p.date), said: `${flightName(p)} flies` }];
  }
  if (p.type === "hotel") {
    return [
      { date: isoDate(p.date), said: `Check-in at ${name} is` },
      { date: isoDate(p.check_out_date), said: `Check-out from ${name} is` },
    ];
  }
  if (p.type === "car_rental") {
    return [
      { date: isoDate(p.date), said: "The car pick-up is" },
      { date: isoDate(p.drop_off_date), said: "The car goes back" },
    ];
  }
  return [{ date: isoDate(p.date), said: `${name} is on` }];
}

export interface OutsideNote {
  /** "AC 890 flies Mon 23 Aug, a day before the trip starts. It'll go on Tue 24 Aug." */
  line: string;
  /** "Extend the trip to Mon 23 Aug" */
  button: string;
  /** The journey's dates once extended to cover the whole booking. */
  start: string;
  end: string;
}

/**
 * The one line the check sheet shows for a booking dated outside the journey,
 * or null when every date it has is inside (or it has none). The line names
 * the first date that is outside; the extension covers all of them, so a hotel
 * that checks in before the start and out after the end extends both edges.
 */
export function bookingOutside(p: ParsedConfirmation, start: string | null, end: string | null): OutsideNote | null {
  const s = isoDate(start), e = isoDate(end);
  if (!s || !e) return null;
  const ev = events(p).map((x) => ({ ...x, at: outsideDates(s, e, x.date) }));
  const first = ev.find((x) => x.at.side !== "none");
  if (!first || first.at.side === "none") return null;
  let ns = s, ne = e;
  for (const x of ev) {
    if (x.at.side === "before" && x.at.extendTo < ns) ns = x.at.extendTo;
    if (x.at.side === "after" && x.at.extendTo > ne) ne = x.at.extendTo;
  }
  const a = first.at;
  const gap = a.days === 1 ? "a day" : `${a.days} days`;
  const where = a.side === "before" ? `${gap} before the trip starts` : `${gap} after the trip ends`;
  const line = `${first.said} ${shortDay(first.date!)}, ${where}. It'll go on ${shortDay(a.nearest)}.`;
  const to = ns !== s && ne !== e ? `${shortDay(ns)} – ${shortDay(ne)}` : shortDay(ns !== s ? ns : ne);
  return { line, button: `Extend the trip to ${to}`, start: ns, end: ne };
}

/**
 * The day a booking's date goes on: its own day when the journey has it, else
 * the nearest edge (first or last day). Null when it has no usable date.
 */
export function dayFor<T extends { id: string; date: string }>(days: T[], date: string | null | undefined): T | null {
  const d = isoDate(date);
  if (!d || days.length === 0) return null;
  const exact = days.find((x) => x.date === d);
  if (exact) return exact;
  const sorted = [...days].sort((x, y) => x.date.localeCompare(y.date));
  const at = outsideDates(sorted[0].date, sorted[sorted.length - 1].date, d);
  if (at.side === "none") return null; // a gap inside the journey: leave it to the person
  return sorted.find((x) => x.date === at.nearest) ?? null;
}
