import type { Card } from "@/types/database";

/**
 * The Map's day strip (24 Sep 2026). Tapping a day does not remove pins —
 * that is what the Saved · Scheduled filter is for. It fades everything that
 * is not on that day, so the plan for the day reads in ink against the rest
 * of the journey. Dayless (saved) places fade with the other days.
 */
export function dimForDay(activeDayId: string | null, cardDayId: string | null | undefined): boolean {
  if (!activeDayId) return false;
  return cardDayId !== activeDayId;
}

/** "Tue 6" — the same shape the Agenda's date strip uses. */
export function dayChipLabel(date: string): string {
  const dt = new Date(date + "T00:00:00");
  const dow = dt.toLocaleDateString("en-GB", { weekday: "short" });
  return `${dow} ${dt.getDate()}`;
}

/**
 * Coordinates of every real place on a day, for framing the map when the day
 * is tapped. Cards without a placed lat/lng (notes, templates) contribute
 * nothing; an empty result means "don't move the map".
 */
export function dayCoords(cards: Card[], dayId: string): [number, number][] {
  const out: [number, number][] = [];
  for (const c of cards) {
    if (c.day_id !== dayId) continue;
    const lat = c.place?.lat;
    const lng = c.place?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    out.push([lng, lat]);
  }
  return out;
}
