import type { Card, DayWithCards } from "@/types/database";

/**
 * What a day would call itself.
 *
 * Deliberately dumb, because it has to be predictable and it has to re-derive
 * itself instantly when a card moves — no model call, no stored answer.
 *
 *   • a flight on the FIRST day is an arrival, on the LAST day a departure.
 *     Direction cannot come from sub_type: both ends of a trip are stored as
 *     "flight_arrival" (see the trip-import notes), so the day's position in
 *     the journey is the only honest signal;
 *   • otherwise a booked TOUR, if one ran for a real length of time — a guided
 *     thing is what a day gets remembered as. Rome day 2 is the Vatican, even
 *     though the afternoon wander was booked for half an hour longer. A wander
 *     has to run more than twice as long to take the day's name off a tour;
 *   • otherwise the day's longest ACTIVITY — not its longest meal, and not its
 *     transit. What you did is what the day was;
 *   • otherwise the first real place on it;
 *   • a day of nothing but notes gets no name, because it has nothing to say.
 *
 * Lives here rather than in PlanBoard because the Agenda needs the same answer.
 * A day named "Arrival" on the board and "Day 1 of 9" on the Agenda was the
 * same day disagreeing with itself (Brennan, Sep 2026); two copies of this
 * function would have let them drift again.
 */
export function autoDayTitle(day: DayWithCards, isFirst: boolean, isLast: boolean): string | null {
  const cards = day.cards.filter((c) => c.status !== "cut");
  if (!cards.length) return null;

  const isFlight = (c: Card) =>
    c.place?.sub_type === "flight_arrival" || c.place?.sub_type === "flight_departure";
  if (isFirst && cards.some(isFlight)) return "Arrival";
  if (isLast && cards.some(isFlight)) return "Departure";

  const minutes = (c: Card) => {
    if (!c.start_time || !c.end_time) return 0;
    const [h1, m1] = c.start_time.split(":").map(Number);
    const [h2, m2] = c.end_time.split(":").map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  };

  const ACTIVITY = new Set(["guided", "self_directed", "event", "challenge", "wellness"]);
  const activities = cards.filter((c) => c.place && ACTIVITY.has(c.place.sub_type ?? ""));
  if (activities.length) {
    const longest = (list: Card[]) => list.reduce((a, b) => (minutes(b) > minutes(a) ? b : a));

    // A tour with a real duration on it. The duration guard matters: a guided
    // card with no end time (Costa Rica's Skyline Guanacaste, Sydney's Opera
    // House evening) measures zero and would otherwise beat a real morning.
    const tours = activities.filter((c) => c.place?.sub_type === "guided" && minutes(c) > 0);
    if (tours.length) {
      const bestTour = longest(tours);
      const bestAny = longest(activities);
      // Twice as long, not merely longer — a four-hour wander does own its day,
      // but half an hour more than the Vatican does not.
      if (minutes(bestAny) <= minutes(bestTour) * 2 && bestTour.place?.title) {
        return bestTour.place.title;
      }
    }

    const best = longest(activities);
    if (best.place?.title) return best.place.title;
  }

  const firstPlace = cards.find((c) => c.place?.title);
  return firstPlace?.place?.title ?? null;
}
