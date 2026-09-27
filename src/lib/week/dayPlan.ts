/**
 * Cards in, times out: the bridge between the app's cards and the arranging
 * engine (lib/week/arrange), shared by the desktop week and the phone
 * (25 Sep 2026). Pure — the callers do the writing and the Undo.
 */

import type { Card } from "@/types/database";
import { cardTimes } from "@/lib/cardTime";
import { arrangeDay, type ArrangeItem, type Busy, type Anchor, type DayEdge } from "./arrange";
import { toMin, toTime, NO_END_MIN } from "./layout";

export interface TimeUpdate { id: string; start_time: string | null; end_time: string | null }

export function toItem(c: Card): ArrangeItem {
  return { id: c.id, type: c.place?.type ?? "activity", subType: c.place?.sub_type ?? null, lat: c.place?.lat ?? null, lng: c.place?.lng ?? null };
}

/** The timed blocks among `cards` (minus `except`) as obstacles. */
export function busyOf(cards: Card[], except: Set<string> = new Set()): Busy[] {
  return cards.flatMap((c) => {
    if (except.has(c.id)) return [];
    const t = cardTimes(c); if (!t.start) return [];
    const s = toMin(t.start); return [{ startMin: s, endMin: t.end ? toMin(t.end) : s + NO_END_MIN }];
  });
}

export type { DayEdge };

/**
 * A flight bounds the day it is on (26 Sep 2026): nothing is arranged after
 * the flight home on the last day, or before landing on the first. Without
 * this, Re-plan and the lasso put Dotonbori at 4pm after a 3pm flight out of
 * Kansai. Middle-of-trip flights are left alone (the direction is unknown).
 */
export function flightBounds(dayCards: Card[], edge?: DayEdge): Busy[] {
  if (!edge || (!edge.first && !edge.last)) return [];
  const flights = dayCards.filter((c) => (c.place?.sub_type ?? "").startsWith("flight") && cardTimes(c).start);
  if (flights.length === 0) return [];
  const out: Busy[] = [];
  if (edge.last) out.push({ startMin: Math.min(...flights.map((c) => toMin(cardTimes(c).start!))), endMin: 24 * 60 });
  if (edge.first) out.push({ startMin: 0, endMin: Math.max(...flights.map((c) => { const t = cardTimes(c); return t.end ? toMin(t.end) : toMin(t.start!) + 60; })) });
  return out;
}

/** Where the walking starts: the first timed place, else the first place, else the fallback. */
export function anchorOf(cards: Card[], fallback: Anchor | null): Anchor | null {
  const withPoint = cards.filter((c) => c.place?.lat != null && c.place?.lng != null);
  const timed = withPoint.filter((c) => cardTimes(c).start).sort((a, b) => toMin(cardTimes(a).start!) - toMin(cardTimes(b).start!));
  const first = timed[0] ?? withPoint[0];
  return first ? { lat: first.place!.lat!, lng: first.place!.lng! } : fallback;
}

/**
 * Re-time a day's own cards. "rest" gives times only to the timeless ones;
 * "all" re-sequences everything that is not confirmed (confirmed cards stay
 * as fixed points). Returns the updates to write and the values to restore.
 */
export function planExisting(dayCards: Card[], mode: "rest" | "all", fallback: Anchor | null, edge?: DayEdge): { updates: TimeUpdate[]; before: TimeUpdate[]; unplaced: string[] } {
  // A timed flight is a fixed point even when not marked confirmed: Re-plan
  // must not walk the flight home to a new hour (26 Sep 2026).
  const isTimedFlight = (c: Card) => (c.place?.sub_type ?? "").startsWith("flight") && !!cardTimes(c).start;
  const movable = mode === "rest" ? dayCards.filter((c) => !cardTimes(c).start) : dayCards.filter((c) => !c.confirmed && !isTimedFlight(c));
  if (movable.length === 0) return { updates: [], before: [], unplaced: [] };
  const moving = new Set(movable.map((c) => c.id));
  const fixed = dayCards.filter((c) => !moving.has(c.id));
  const { placed, unplaced } = arrangeDay(movable.map(toItem), [...busyOf(dayCards, moving), ...flightBounds(fixed, edge)], anchorOf(fixed, fallback), edge);
  const updates: TimeUpdate[] = placed.map((p) => ({ id: p.id, start_time: toTime(p.startMin), end_time: toTime(p.endMin) }));
  if (mode === "all") for (const id of unplaced) updates.push({ id, start_time: null, end_time: null });
  const before: TimeUpdate[] = movable.filter((c) => updates.some((u) => u.id === c.id)).map((c) => ({ id: c.id, start_time: c.start_time, end_time: c.end_time }));
  return { updates, before, unplaced };
}

/**
 * A batch of picked cards for a day: skips places already on the day (and
 * repeats within the batch), and places already planned on ANOTHER day
 * (`plannedElsewhere`, place ids) — a lasso over Osaka copied Universal
 * Studios onto a second day (26 Sep 2026). Gives the rest times around what
 * is there. `times` is keyed by the picked card's id; missing = "no time".
 */
export function planBatch(picked: Card[], dayCards: Card[], fallback: Anchor | null, opts: { plannedElsewhere?: Set<string>; edge?: DayEdge } = {}): { toAdd: Card[]; times: Map<string, { start: string; end: string }>; skipped: number; elsewhere: number; unplaced: string[] } {
  const already = new Set(dayCards.map((c) => c.place_id).filter(Boolean));
  const other = opts.plannedElsewhere ?? new Set<string>();
  const seen = new Set<string>();
  let elsewhere = 0;
  const toAdd = picked.filter((c) => {
    if (!c.place_id || already.has(c.place_id) || seen.has(c.place_id)) return false;
    seen.add(c.place_id);
    if (other.has(c.place_id)) { elsewhere++; return false; }
    return true;
  });
  const skipped = picked.filter((c) => c.place_id).length - toAdd.length - elsewhere;
  const { placed, unplaced } = arrangeDay(toAdd.map(toItem), [...busyOf(dayCards), ...flightBounds(dayCards, opts.edge)], anchorOf(dayCards, fallback), opts.edge);
  const times = new Map(placed.map((p) => [p.id, { start: toTime(p.startMin), end: toTime(p.endMin) }]));
  return { toAdd, times, skipped, elsewhere, unplaced };
}

/** Place ids on any day except `dayId` — the "already planned" set for planBatch. */
export function plannedOtherDays(allDayCards: Card[], dayId: string): Set<string> {
  return new Set(allDayCards.filter((c) => c.day_id && c.day_id !== dayId && c.place_id).map((c) => c.place_id as string));
}
