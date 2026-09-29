/**
 * Times a drafted day so it is real (29 Sep 2026, "Plan my trip"). The day
 * planner orders a day and gives every sight 90 minutes; that put Tokyo
 * DisneySea at 9:45–11:15, and it never looked at opening hours, so a
 * lunch could land at a restaurant that opens at one (Toyo, Osaka).
 *
 * - A sight takes the time its share of a day says: a whole day (a theme
 *   park, a town) about seven hours, half a day two and a half, a shop an
 *   hour. Meals keep the planner's slot and length.
 * - Nothing starts before a place opens or runs past its closing; a place
 *   that cannot fit inside its hours that day is left without a time, for
 *   the person to place, rather than put somewhere it is shut.
 * - A meal may sit inside a whole-day sight (lunch at the park); anything
 *   else waits for the one before it, with a quarter of an hour between.
 * - Cards already on the day with times are fixed; drafted ones move round them.
 */

export interface Window { open: number; close: number }

/** Minutes after midnight, from Google's "HHMM". */
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2, 4));

type Period = { open?: { day?: number; time?: string }; close?: { day?: number; time?: string } };

/**
 * The window a place is open on a date: null when its hours are unknown,
 * "closed" when it has hours and none that day. Split hours (lunch and
 * dinner) read as one window from the first opening to the last closing.
 */
export function hoursWindow(hours: unknown, date: string): Window | "closed" | null {
  const periods = (hours as { periods?: unknown } | null)?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const ps = periods as Period[];
  // Open 24 hours, every day: one period, Sunday 0000, no close.
  if (ps.length === 1 && ps[0].open?.day === 0 && ps[0].open?.time === "0000" && !ps[0].close) return { open: 0, close: 24 * 60 };
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // Sunday 0, as Google
  let open: number | null = null, close: number | null = null;
  for (const p of ps) {
    const od = p.open?.day, ot = p.open?.time, cd = p.close?.day, ct = p.close?.time;
    if (typeof od !== "number" || typeof ot !== "string") continue;
    if (od === dow) {
      const o = minutesOf(ot);
      const c = typeof cd === "number" && typeof ct === "string" && cd === dow ? minutesOf(ct) : 24 * 60;
      open = open === null ? o : Math.min(open, o);
      close = close === null ? c : Math.max(close, c);
    } else if (typeof cd === "number" && cd !== od) {
      // A period running across days ("24 hours, Mon–Fri") covers the days inside it.
      for (let k = 1; k < 7 && (od + k) % 7 !== cd; k++) {
        if ((od + k) % 7 === dow) { open = 0; close = 24 * 60; }
      }
    }
  }
  return open === null || close === null ? "closed" : { open, close };
}

// Places that keep office hours whatever Google says, used when it says
// nothing: the Museum of Natural History, saved without hours, was planned
// at 7:30 pm (New York test, 29 Sep 2026).
const DAYTIME = ["museum", "art_gallery", "zoo", "aquarium", "amusement_park", "library", "church", "place_of_worship"];

/** The window to assume when a place's hours are unknown: a daytime one for museum-like places, else none. */
export function assumedWindow(types: string[] | null | undefined): Window | null {
  return (types ?? []).some((t) => DAYTIME.includes(t)) ? { open: 10 * 60, close: 17 * 60 } : null;
}

export interface RetimeItem {
  id: string;
  /** The planner's start, minutes after midnight; null when it gave none. */
  start: number | null;
  end: number | null;
  kind: "meal" | "sight";
  /** How long a sight takes; ignored for a meal, which keeps its own length. */
  minutes: number;
  whole: boolean;
  window: Window | null;
}

export const GAP_MIN = 15;
const DAY_OPENS = 9 * 60;
const DAY_ENDS = 23 * 60;

export function retimeDay(items: RetimeItem[], fixed: { start: number; end: number }[] = []): Map<string, { start: number; end: number } | null> {
  const out = new Map<string, { start: number; end: number } | null>();
  const order = [...items].sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
  const busy = [...fixed];
  const wholes: { start: number; end: number }[] = [];
  let cursor: number | null = null;

  const clear = (s: number, e: number) => {
    // Move past any fixed card it would overlap.
    for (let moved = true; moved;) {
      moved = false;
      for (const b of busy) if (s < b.end && e > b.start) { const d = e - s; s = b.end + GAP_MIN; e = s + d; moved = true; }
    }
    return [s, e] as const;
  };
  const fit = (s: number, dur: number, w: Window | null, floor: number): { start: number; end: number } | null => {
    const open = w ? w.open : 0, close = w ? w.close : DAY_ENDS;
    let start = Math.max(s, open, floor);
    let end = start + dur;
    [start, end] = clear(start, end);
    if (end > Math.min(close, DAY_ENDS)) {
      const back = Math.min(close, DAY_ENDS) - dur;
      if (back < Math.max(open, floor)) return null;
      [start, end] = clear(back, back + dur);
      if (end > Math.min(close, DAY_ENDS)) return null;
    }
    return { start, end };
  };

  for (const it of order) {
    if (it.kind === "meal") {
      const dur = it.start !== null && it.end !== null ? it.end - it.start : 60;
      const planned = it.start ?? 12 * 60 + 30;
      const inside = wholes.some((w) => planned >= w.start && planned < w.end);
      const t = fit(planned, dur, it.window, inside ? 0 : cursor === null ? 0 : cursor + GAP_MIN);
      out.set(it.id, t);
      if (t && !inside) { busy.push(t); cursor = Math.max(cursor ?? 0, t.end); }
      continue;
    }
    const floor = cursor === null ? DAY_OPENS : cursor + GAP_MIN;
    const t = fit(it.start ?? floor, it.minutes, it.window, floor);
    out.set(it.id, t);
    if (t) { cursor = t.end; if (it.whole) wholes.push(t); else busy.push(t); }
  }
  return out;
}

/** Minutes a sight takes, from its share of a day. */
export function sightMinutes(share: number): number {
  return share >= 1 ? 420 : share >= 0.5 ? 150 : 60;
}
