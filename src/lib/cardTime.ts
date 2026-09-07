import type { Card } from "@/types/database";

/**
 * The clock times a card actually happens at.
 *
 * For everything except a flight this is just what is stored. A flight that
 * takes you somewhere is the exception: it is stored as when you left, and
 * what you want to see is when you land — "7:45 PM" on Rome day 1 put an
 * overnight flight at the bottom of the arrival day.
 *
 * Not every flight is stored that way, which is why this checks rather than
 * assumes. Australia and Costa Rica store the LANDING in start_time and the
 * hotel arrival in end_time, and already read correctly. The departure-first
 * cards are the ones carrying a `departure_time` detail equal to start_time —
 * that equality is the whole test, and it is deliberately strict: a 24-hour
 * "19:45" counts, a 12-hour "4:00" does not, because "4:00" on the New York
 * flight home means 4 PM and matching it loosely would move a departure that
 * is already right.
 */
export function cardTimes(card: Card): { start: string | null; end: string | null } {
  const stored = { start: card.start_time, end: card.end_time };
  if (card.place?.sub_type !== "flight_arrival") return stored;
  if (!card.start_time || !card.end_time) return stored;

  const det = card.details as Record<string, unknown> | null;
  const departure = typeof det?.departure_time === "string" ? det.departure_time : null;
  if (!departure || !/^\d{1,2}:\d{2}$/.test(departure)) return stored;
  if (card.start_time.slice(0, 5) !== departure.padStart(5, "0")) return stored;

  // The stored end is the landing. Show it alone: a range from a departure to
  // an arrival reads as a four-hour event in the day, which it is not.
  return { start: card.end_time, end: null };
}
