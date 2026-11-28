/**
 * The phone day as an Outlook-style day (28 Nov 2026, Brennan; clickable mock approved:
 * https://claude.ai/artifact/LbFYCDN84q6wCu3xMMHhHL). He wanted to see how long things take
 * against each other and when you are free: blocks as tall as they last, empty time left empty,
 * overlaps side by side.
 *
 * Times are the STORED ones, not cardTimes: the list chips an arriving flight at its landing,
 * but the grid draws the flight itself, takeoff to landing (New York AC8458, 9:20 → 10:55).
 * An overnight flight kept on the day it lands (Rome AC890, lib/cardTime storedOnLandingDay)
 * shows from the top of the day to its landing; one kept on the day it leaves runs to midnight.
 */
import { storedOnLandingDay, type TimedCard } from "@/lib/cardTime";

/** A block never gets shorter than this, so a 10-minute stop is still a tappable line. */
export const MIN_BLOCK_MIN = 30;
const DAY_MIN = 24 * 60;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** When a card happens on the grid, in minutes from midnight; null for an untimed card. */
export function gridSpan(card: TimedCard): { start: number; end: number } | null {
  if (!card.start_time) return null;
  const s = toMin(card.start_time);
  if (!card.end_time) return { start: s, end: Math.min(DAY_MIN, s + MIN_BLOCK_MIN) };
  const e = toMin(card.end_time);
  if (e > s) return { start: s, end: Math.max(e, Math.min(DAY_MIN, s + MIN_BLOCK_MIN)) };
  // Ends before it starts: an overnight flight (or a late night out).
  if (storedOnLandingDay(card)) return { start: Math.max(0, e - MIN_BLOCK_MIN), end: Math.max(e, MIN_BLOCK_MIN) };
  return { start: s, end: DAY_MIN };
}

export interface GridItem<C> {
  card: C;
  /** Minutes from midnight. */
  start: number;
  end: number;
  /** Side by side: this block's column and how many columns its overlapping group has. */
  col: number;
  of: number;
}

export interface DayGrid<C> {
  /** The first and last hour drawn (from 7 AM to 9 PM → 7 and 21). */
  fromHour: number;
  toHour: number;
  items: GridItem<C>[];
}

/**
 * Lays a day's timed cards out like a calendar day: overlapping cards share the width in
 * columns, the way Outlook and Google Calendar do it. Untimed cards are left out (the list
 * under the grid keeps them).
 */
export function layoutDay<C extends TimedCard>(cards: C[]): DayGrid<C> {
  const spans: GridItem<C>[] = [];
  for (const card of cards) {
    const span = gridSpan(card);
    if (span) spans.push({ card, start: span.start, end: span.end, col: 0, of: 1 });
  }
  if (!spans.length) return { fromHour: 9, toHour: 17, items: [] };
  const order = spans.map((it, i) => ({ it, i, s: it.start, e: it.end }));
  order.sort((a, b) => a.s - b.s || b.e - a.e || a.i - b.i);

  // Groups of blocks that overlap one another, each laid into the fewest columns.
  let group: GridItem<C>[] = [];
  let groupEnd = -1;
  const settle = () => {
    const colEnds: number[] = [];
    for (const it of group) {
      let c = 0;
      while (colEnds[c] !== undefined && colEnds[c] > it.start) c++;
      colEnds[c] = it.end;
      it.col = c;
    }
    for (const it of group) it.of = colEnds.length;
    group = [];
  };
  for (const { it } of order) {
    if (group.length && it.start >= groupEnd) settle();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  settle();

  const first = Math.min(...spans.map((s) => s.start));
  const last = Math.max(...spans.map((s) => s.end));
  const fromHour = Math.floor(first / 60);
  const toHour = Math.min(24, Math.max(fromHour + 3, Math.ceil(last / 60) + 1));
  return { fromHour, toHour, items: order.map((o) => o.it) };
}

/** "9 AM", "12 PM", "12 AM" (midnight at the bottom of the day). */
export function hourLabel(h: number): string {
  const hh = h % 24;
  return `${hh % 12 || 12} ${hh < 12 ? "AM" : "PM"}`;
}
