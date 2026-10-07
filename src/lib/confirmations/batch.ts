import type { ParsedConfirmation } from "./toCards";
import { shortDay } from "./outsideDates";

/**
 * Several confirmations at once (6 Oct 2026, taps audit). The picker used to
 * take one file: a flight out, a car, a hotel, the Uffizi and the flight home
 * was five rounds of pick, wait, check, add, toast — 15 taps. Now every file
 * is read through the same /api/confirmations/parse (one file per call, the
 * route's contract unchanged), three at a time, and ONE sheet lists every
 * booking found. A file that can't be read is listed with its reason and
 * never blocks the rest.
 */

/** Three reads in flight: quick for a handful, gentle on the route's quota. */
export const PARSE_AT_ONCE = 3;
/** One pick reads at most this many files. Each is a paid Claude read (60 a day per person). */
export const MAX_FILES = 10;

/** Runs fn over items with at most `limit` running at once; results keep the items' order. */
export async function inBatches<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export interface FileRef { name: string; type: string }
export type FileRead =
  | { file: FileRef; items: ParsedConfirmation[] }
  | { file: FileRef; reason: string };

export interface Combined {
  items: ParsedConfirmation[];
  /** For each booking, the index into `files` it was read from. */
  fileOf: number[];
  /** The files that gave at least one booking, in the order picked. */
  files: FileRef[];
  failures: { name: string; reason: string }[];
}

export function combineReads(reads: FileRead[]): Combined {
  const out: Combined = { items: [], fileOf: [], files: [], failures: [] };
  for (const r of reads) {
    if ("reason" in r || r.items.length === 0) {
      out.failures.push({ name: r.file.name, reason: "reason" in r ? r.reason : "No booking found in it." });
      continue;
    }
    const at = out.files.push(r.file) - 1;
    for (const item of r.items) { out.items.push(item); out.fileOf.push(at); }
  }
  return out;
}

/** "Added 5 bookings · Tue 25 Aug – Sat 29 Aug"; one booking: "Added to your days · Tue 25 Aug". */
export function addedMessage(bookings: number, dates: (string | null | undefined)[]): string {
  const sorted = dates.filter((d): d is string => !!d).sort();
  const head = bookings === 1 ? "Added to your days" : `Added ${bookings} bookings`;
  if (!sorted.length) return head;
  const first = shortDay(sorted[0]), last = shortDay(sorted[sorted.length - 1]);
  return `${head} · ${first === last ? first : `${first} – ${last}`}`;
}

function longDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * A compact row's second line, from what the row will save (the day picked,
 * the times as edited): "Day 1 — Tue, Aug 25 · arrives 10:40 AM",
 * "Check in Tue, Aug 25 → out Sat, Aug 29", "Tue, Aug 25 → Sat, Aug 29".
 */
export function whenLine(type: ParsedConfirmation["type"], at: {
  dayNumber: number | null; date: string | null; time: string; endTime: string; outDate: string | null;
}): string {
  const day = at.date ? longDay(at.date) : "";
  const out = at.outDate ? longDay(at.outDate) : null;
  if (type === "hotel") return [`Check in ${day}`.trim(), out ? `out ${out}` : null].filter(Boolean).join(" → ");
  if (type === "car_rental") return out ? `${day} → ${out}` : day;
  const lead = at.dayNumber != null ? `Day ${at.dayNumber}${day ? ` — ${day}` : ""}` : day;
  let t = "";
  if (type === "flight_arrival") t = at.endTime ? `arrives ${clock(at.endTime)}` : at.time ? `departs ${clock(at.time)}` : "";
  else if (type === "flight_departure") t = at.time ? `departs ${clock(at.time)}` : "";
  else t = at.time ? clock(at.time) : "";
  return t ? `${lead} · ${t}` : lead;
}
