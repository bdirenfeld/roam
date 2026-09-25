/**
 * Cards in, times out: the bridge between the app's cards and the arranging
 * engine (lib/week/arrange), shared by the desktop week and the phone
 * (25 Sep 2026). Pure — the callers do the writing and the Undo.
 */

import type { Card } from "@/types/database";
import { cardTimes } from "@/lib/cardTime";
import { arrangeDay, type ArrangeItem, type Busy, type Anchor } from "./arrange";
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
export function planExisting(dayCards: Card[], mode: "rest" | "all", fallback: Anchor | null): { updates: TimeUpdate[]; before: TimeUpdate[]; unplaced: string[] } {
  const movable = mode === "rest" ? dayCards.filter((c) => !cardTimes(c).start) : dayCards.filter((c) => !c.confirmed);
  if (movable.length === 0) return { updates: [], before: [], unplaced: [] };
  const moving = new Set(movable.map((c) => c.id));
  const fixed = dayCards.filter((c) => !moving.has(c.id));
  const { placed, unplaced } = arrangeDay(movable.map(toItem), busyOf(dayCards, moving), anchorOf(fixed, fallback));
  const updates: TimeUpdate[] = placed.map((p) => ({ id: p.id, start_time: toTime(p.startMin), end_time: toTime(p.endMin) }));
  if (mode === "all") for (const id of unplaced) updates.push({ id, start_time: null, end_time: null });
  const before: TimeUpdate[] = movable.filter((c) => updates.some((u) => u.id === c.id)).map((c) => ({ id: c.id, start_time: c.start_time, end_time: c.end_time }));
  return { updates, before, unplaced };
}

/**
 * A batch of picked cards for a day: skips places already on the day (and
 * repeats within the batch), then gives the rest times around what is there.
 * `times` is keyed by the picked card's id; a missing key means "no time".
 */
export function planBatch(picked: Card[], dayCards: Card[], fallback: Anchor | null): { toAdd: Card[]; times: Map<string, { start: string; end: string }>; skipped: number; unplaced: string[] } {
  const already = new Set(dayCards.map((c) => c.place_id).filter(Boolean));
  const seen = new Set<string>();
  const toAdd = picked.filter((c) => c.place_id && !already.has(c.place_id) && !seen.has(c.place_id) && seen.add(c.place_id));
  const skipped = picked.filter((c) => c.place_id).length - toAdd.length;
  const { placed, unplaced } = arrangeDay(toAdd.map(toItem), busyOf(dayCards), anchorOf(dayCards, fallback));
  const times = new Map(placed.map((p) => [p.id, { start: toTime(p.startMin), end: toTime(p.endMin) }]));
  return { toAdd, times, skipped, unplaced };
}
