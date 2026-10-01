/**
 * The days an event is on (1 Oct 2026). Brennan: "if you drag and drop an event
 * onto a day but that event is only on a specific day (like that barrel
 * rolling thing in Tuscany), we should do something to prevent people from
 * putting it on the wrong day". Find saves each event with its date line
 * (details.find.why: "Usually Sun 29 Aug: Bravio delle Botti …"); this reads
 * it against the journey's dates. Pure.
 *
 * Returns the journey dates (YYYY-MM-DD) the event is on, or null when that
 * is unknown or every day of the journey — then it goes wherever it is put.
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const M = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*";
const WD = "(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\\.?\\s+)?";

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function eventDates(why: string | null | undefined, from: string, to: string): string[] | null {
  if (!why) return null;
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  if (!(a <= b)) return null;
  const years = Array.from(new Set([new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear()]));
  // Only the date part, before the description: "Sun 29 Aug: ..." or "Usually Sun 2–Sat 15 Apr — ...".
  const head = why.split(/[:—]/)[0];
  const on = new Set<string>();
  const add = (y: number, m: number, d: number) => { const t = Date.UTC(y, m, d); if (t >= a && t <= b) on.add(iso(t)); };
  let rest = head;
  // Ranges: "Thu 13–Sat 15 Apr", "Fri 27 Aug–Sat 28 Aug", "Sun 2 – Wed 12 Apr".
  const range = new RegExp(`${WD}(\\d{1,2})(?:\\s+${M})?\\s*[–-]\\s*${WD}(\\d{1,2})\\s+${M}`, "g");
  rest = rest.replace(range, (_all, d1: string, m1: string | undefined, d2: string, m2: string) => {
    const mEnd = MON.indexOf(m2.slice(0, 3));
    const mStart = m1 ? MON.indexOf(m1.slice(0, 3)) : mEnd;
    for (const y of years) {
      for (let t = Date.UTC(y, mStart, Number(d1)); t <= Date.UTC(y, mEnd, Number(d2)); t += 86_400_000) {
        if (t >= a && t <= b) on.add(iso(t));
      }
    }
    return " ";
  });
  // Single dates: "Sun 29 Aug", "Fri 7 Apr & Sat 8 Apr", "Sat 28 Aug and Sat 4 Sep".
  for (const m of Array.from(rest.matchAll(new RegExp(`(\\d{1,2})\\s+${M}`, "g")))) {
    for (const y of years) add(y, MON.indexOf(m[2].slice(0, 3)), Number(m[1]));
  }
  if (on.size === 0) return null;
  const days = Math.round((b - a) / 86_400_000) + 1;
  if (on.size >= days) return null; // on every day: no constraint
  return Array.from(on).sort();
}

/** The day to put it on: the one dropped on if allowed, else the nearest allowed day. */
export function eventDay(allowed: string[] | null, dropped: string): string {
  if (!allowed || allowed.includes(dropped)) return dropped;
  const t = Date.parse(dropped + "T00:00:00Z");
  return [...allowed].sort((x, y) => Math.abs(Date.parse(x + "T00:00:00Z") - t) - Math.abs(Date.parse(y + "T00:00:00Z") - t))[0];
}

/** A card's event dates on its journey, from what Find saved with it. */
export function cardEventDates(card: { details?: unknown; place?: { sub_type?: string | null } | null } | null | undefined, from: string, to: string): string[] | null {
  const sub = card?.place?.sub_type;
  if (sub !== "event" && sub !== "challenge" && sub !== "camp") return null;
  const why = ((card?.details as { find?: { why?: unknown } } | null)?.find?.why);
  return typeof why === "string" ? eventDates(why, from, to) : null;
}

/**
 * Where a card put on a day really goes: its own day when it is an event on
 * set days, else the day chosen. Shared by every door onto a day (the week's
 * drops, the pin's Put on a day, the phone's pick-and-place).
 */
export function dayForCard<D extends { id: string; date: string }>(card: Parameters<typeof cardEventDates>[0], days: D[], chosen: D): { day: D; moved: boolean; dates: string[] } {
  const ds = days.map((d) => d.date).filter(Boolean).sort();
  if (!ds.length) return { day: chosen, moved: false, dates: [] };
  const allowed = cardEventDates(card, ds[0], ds[ds.length - 1]);
  const date = eventDay(allowed, chosen.date);
  if (date === chosen.date) return { day: chosen, moved: false, dates: allowed ?? [] };
  const day = days.find((d) => d.date === date);
  return day ? { day, moved: true, dates: allowed ?? [] } : { day: chosen, moved: false, dates: allowed ?? [] };
}

const dayLabel = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Why it moved, in his words (1 Oct 2026): "Bravio delle Botti only happens on
 * Sun 29 Aug, so I moved it there"; with several dates, which one it went to.
 */
export function onlyOnLine(title: string, date: string, dates: string[] = [date]): string {
  const all = dates.length ? dates : [date];
  const when = all.length === 1 ? dayLabel(all[0])
    : all.length === 2 ? `${dayLabel(all[0])} and ${dayLabel(all[1])}`
    : `${dayLabel(all[0])} to ${dayLabel(all[all.length - 1])}`;
  return all.length === 1 ? `${title} only happens on ${when}, so I moved it there` : `${title} only happens on ${when}, so I moved it to ${dayLabel(date)}`;
}
