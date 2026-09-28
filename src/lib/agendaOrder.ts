import { cardTimes, type TimedCard } from "./cardTime";

/**
 * The order cards appear in within a day: chronological, untimed cards last,
 * `position` as the tiebreak so untimed cards hold a stable order.
 *
 * Chronological by when the card HAPPENS, not by what is stored — which is why
 * this goes through `cardTimes` rather than reading `start_time`. An arriving
 * flight is stored as when it pushed back and belongs at its landing time.
 *
 * This lives in lib because there are two readers of a day, not one: the
 * owner's agenda and the read-only itinerary a guest opens from a share link.
 * They disagreed until 2026-09-07 — the guest page sorted on raw `start_time`,
 * so Rome's overnight flight sat at the BOTTOM of the day it lands on for
 * everyone the journey had been shared with, while the owner saw it at the top.
 * The comment there claimed it matched the owner's order; it did not. One
 * exported function is the only way that stays true.
 */

export type OrderableCard = TimedCard & { position: number | null };

export function agendaOrder(a: OrderableCard, b: OrderableCard): number {
  const at = cardTimes(a).start;
  const bt = cardTimes(b).start;
  if (at && bt) {
    const t = at.localeCompare(bt);
    if (t !== 0) return t;
  } else if (at) return -1;
  else if (bt) return 1;
  return (a.position ?? 0) - (b.position ?? 0);
}

/**
 * A day's cards in the order a phone's Plan board shows them (27 Sep 2026):
 * timed cards by the clock, untimed after them in the order they are in now,
 * so a drag among untimed cards still holds. The board listed by `position`
 * alone, and Nashville's Day 1 read "hotel 3 pm, flight 10 am, lunch 12:30"
 * because the hotel was added first. Returns the same array when nothing
 * moves, so a render with nothing to do changes nothing.
 */
export function timeFirst<T extends TimedCard>(cards: T[]): T[] {
  const at = cards.map((c, i) => ({ c, i, t: cardTimes(c).start }));
  const sorted = [...at].sort((a, b) => {
    if (a.t && b.t) return a.t.localeCompare(b.t) || a.i - b.i;
    if (a.t) return -1;
    if (b.t) return 1;
    return a.i - b.i;
  });
  return sorted.every((x, i) => x.i === i) ? cards : sorted.map((x) => x.c);
}
