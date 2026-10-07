/**
 * One door onto a day from the journey Map (7 Oct 2026, taps audit). The
 * lasso's picked pins and a single pin's "Put on a day" go through the same
 * plan: events on set days go to their own day, untimed (lib/plan/eventDays);
 * the rest are timed by planBatch from where you wake up that day (the hotel,
 * else the journey's centre), around what is already there — a stay at its
 * 3:00 PM check-in. Before this, one pin landed with no time and its toast had
 * no Undo, while the lasso timed and could be undone.
 *
 * Pure: FullMapClient's putCardsOnDay does the writes, the toast and the Undo.
 */

import type { Card } from "@/types/database";
import { dayForCard } from "@/lib/plan/eventDays";
import { planBatch, plannedOtherDays, stayAnchor } from "@/lib/week/dayPlan";
import type { Anchor } from "@/lib/week/arrange";
import { formatTimeValue } from "@/lib/formatTime";

export interface PutDay { id: string; date: string; day_number: number }

export interface PutOnDayPlan<D extends PutDay> {
  /** Events that only happen on other dates: each goes to its own day, untimed. */
  ownDay: { card: Card; day: D; dates: string[] }[];
  /** The rest, for the day chosen, with times keyed by the picked card's id. */
  batch: ReturnType<typeof planBatch>;
}

/**
 * `single` is a single pin's Put on a day: a place already planned on ANOTHER
 * day may go on this one too (a second visit), so the other-days exclusion is
 * empty. The lasso keeps it (a lasso over Osaka copied Universal Studios onto
 * a second day, 26 Sep 2026). Either way a place already on THIS day is skipped.
 */
export function planPutOnDay<D extends PutDay>(
  chosen: Card[],
  day: D,
  ctx: { days: D[]; allCards: Card[]; destination: Anchor | null; single?: boolean },
): PutOnDayPlan<D> {
  const { days, allCards } = ctx;
  const ownDay = chosen
    .map((card) => ({ card, to: dayForCard(card, days, day) }))
    .filter((x) => x.to.moved)
    .map((x) => ({ card: x.card, day: x.to.day, dates: x.to.dates }));
  const moved = new Set(ownDay.map((x) => x.card.id));
  const picked = chosen.filter((c) => !moved.has(c.id));
  const dayCards = allCards.filter((c) => c.day_id === day.id);
  const fallback = stayAnchor(days.map((d) => d.id), allCards, day.id) ?? ctx.destination;
  const batch = planBatch(picked, dayCards, fallback, {
    plannedElsewhere: ctx.single ? new Set<string>() : plannedOtherDays(allCards, day.id),
    edge: { first: days[0]?.id === day.id, last: days[days.length - 1]?.id === day.id },
  });
  return { ownDay, batch };
}

/** "Put on Tue 25 Aug · 3:00 PM", or "· no free time" when the day had no room. */
export function singlePutLine(dayLabel: string, start: string | null | undefined): string {
  return `Put on ${dayLabel} · ${start ? formatTimeValue(start) : "no free time"}`;
}

/** Nothing new went on: every place was already on this day (or, for the lasso, on others). */
export function alreadyLine(dayNumber: number, elsewhere: boolean): string {
  return elsewhere ? "Already planned on other days" : `Already on Day ${dayNumber}`;
}

/** The lasso's line: "3 places on Day 2, in walking order · 1 already there". */
export function batchPutLine(n: number, dayNumber: number, unplaced: number, skipped: number, elsewhere: number): string {
  return [
    unplaced ? `${n} on Day ${dayNumber}; ${unplaced} without a time` : `${n} ${n === 1 ? "place" : "places"} on Day ${dayNumber}, in walking order`,
    skipped ? `${skipped} already there` : "",
    elsewhere ? `${elsewhere} already on other days` : "",
  ].filter(Boolean).join(" · ");
}
