import { agendaOrder, type OrderableCard } from "@/lib/agendaOrder";
import { stayRuns, stayOn, type StayCard } from "@/lib/stays/stayRuns";

/**
 * The map inside the day page (8 Oct 2026, docs/phone-map-one-page-spec.html):
 * the chosen day's stops are numbered, everything else is muted. The numbers
 * must be the list's, so this is the day page's own rule in one place: the
 * day's placed cards with a location, in agenda order, 1-based.
 */
export type FocusCard = OrderableCard & {
  id: string;
  day_id: string | null;
  status: string | null;
  archived?: boolean | null;
  place?: { lat: number | null; lng: number | null; sub_type: string | null } | null;
};

export function dayPinNumbers(cards: FocusCard[], dayId: string | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!dayId) return out;
  cards
    .filter((c) => c.day_id === dayId && c.status === "in_itinerary" && c.archived !== true && c.place?.lat != null && c.place?.lng != null)
    .sort((a, b) => agendaOrder(a, b))
    .forEach((c, i) => out.set(c.id, i + 1));
  return out;
}

/** How strong a pin is drawn: full for the day's stops (or when no day is chosen), muted otherwise. Desktop's week map uses the same 0.22. */
export const MUTED_PIN_OPACITY = 0.22;

export function pinOpacity(cardId: string, numbers: Map<string, number>, dayId: string | null): number {
  if (!dayId) return 1;
  return numbers.has(cardId) ? 1 : MUTED_PIN_OPACITY;
}

/**
 * The night's stay for a day on the map (8 Oct 2026, Brennan: "it should
 * show the starting location of your hotel, like it does on the other
 * view"): the same hotel the day strip stars (lib/stays stayOn), so the two
 * agree. Returns its place id, or null when the day has no stay.
 */
export function stayPlaceFor(
  cards: (StayCard & { day_id: string | null; archived?: boolean | null })[],
  days: { id: string; date: string }[],
  tripEnd: string,
  dayId: string | null,
): string | null {
  if (!dayId) return null;
  const day = days.find((d) => d.id === dayId);
  if (!day) return null;
  const hotels = cards.filter((c) => c.place?.sub_type === "hotel" && c.status !== "cut" && c.archived !== true);
  const runs = stayRuns(days.map((d) => ({ date: d.date, cards: hotels.filter((c) => c.day_id === d.id) })), tripEnd);
  return stayOn(runs, day.date)?.placeId ?? null;
}
