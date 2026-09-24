import { describe, it, expect } from "vitest";
import { dimForDay, dayChipLabel, dayCoords } from "./mapDayFilter";
import type { Card } from "@/types/database";

// Shapes copied from Tuscany rows (24 Sep 2026): a scheduled card carries its
// day_id, a saved-from-the-map card has day_id null, and a note card has a
// place with no coordinates.
const DAY_A = "6f1c2a1e-0000-4000-8000-000000000001";
const DAY_B = "6f1c2a1e-0000-4000-8000-000000000002";

function card(day_id: string | null, lat: number | null, lng: number | null): Card {
  return {
    id: crypto.randomUUID(),
    day_id,
    status: day_id ? "in_itinerary" : "interested",
    place: { lat, lng } as Card["place"],
  } as unknown as Card;
}

describe("dimForDay", () => {
  it("fades nothing when no day is chosen", () => {
    expect(dimForDay(null, DAY_A)).toBe(false);
    expect(dimForDay(null, null)).toBe(false);
  });
  it("keeps the chosen day in ink and fades every other day", () => {
    expect(dimForDay(DAY_A, DAY_A)).toBe(false);
    expect(dimForDay(DAY_A, DAY_B)).toBe(true);
  });
  it("fades saved places (no day) once a day is chosen", () => {
    expect(dimForDay(DAY_A, null)).toBe(true);
    expect(dimForDay(DAY_A, undefined)).toBe(true);
  });
});

describe("dayChipLabel", () => {
  it("reads like the Agenda strip", () => {
    expect(dayChipLabel("2026-10-06")).toBe("Tue 6");
    expect(dayChipLabel("2026-10-31")).toBe("Sat 31");
  });
});

describe("dayCoords", () => {
  const cards = [
    card(DAY_A, 43.318, 11.331),
    card(DAY_A, 43.319, 11.332),
    card(DAY_B, 43.467, 11.043),
    card(null, 43.0, 11.0),
    card(DAY_A, null, null),
  ];
  it("returns [lng, lat] for the day's placed cards only", () => {
    expect(dayCoords(cards, DAY_A)).toEqual([[11.331, 43.318], [11.332, 43.319]]);
  });
  it("is empty for a day with nothing placed, so the map stays put", () => {
    expect(dayCoords(cards, "no-such-day")).toEqual([]);
  });
});
