// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CardSurface from "./CardSurface";
import type { Card } from "@/types/database";

/**
 * Row E (24 Sep 2026), rendered. The rail is the time and nothing else; the
 * category glyph leads the subtitle instead of the category word; every row
 * carries a tile, note or place, photo or not. Shapes copied from Tuscany
 * Day 8 rows: a restaurant with an address, and a note with no place.
 */
const placeCard = {
  id: "c1", trip_id: "t", day_id: "d", place_id: "p1", status: "in_itinerary", position: 3,
  start_time: "12:30:00", end_time: null, confirmed: false, archived: false, details: null,
  place: {
    id: "p1", title: "Trattoria Mario", type: "food", sub_type: "restaurant", lat: 43.77, lng: 11.25,
    address: "Via Rosina, 2r, 50123 Firenze FI, Italy", google_place_id: "g", cover_image_url: null,
    rating: 4.6, price_level: 2, website: null, phone: null, hours: null, loved: false, loved_at: null,
  },
} as unknown as Card;

const noteCard = {
  id: "c2", trip_id: "t", day_id: "d", place_id: null, status: "in_itinerary", position: 5,
  start_time: "15:30:00", end_time: "18:30:00", confirmed: false, archived: false,
  details: { title: "Back from Florence, last swim", notes: "3pm train home. Dinner in Lucca at 7:30." },
  place: null,
} as unknown as Card;

describe("CardSurface — Row E", () => {
  it("draws no pin number on the row; the rail is only the time", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" pinIndex={3} />);
    expect(container.querySelector('[aria-label^="Pin "]')).toBeNull();
    expect(container.textContent).toMatch(/12:30/);
    expect(container.textContent).not.toMatch(/(^|\D)3(\D|$)/);
  });

  it("leads the subtitle with the category glyph, not the category word", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" />);
    expect(container.textContent).not.toMatch(/Restaurant ·/);
    expect(container.textContent).toMatch(/Via Rosina/);
    expect(container.querySelector(".material-symbols-outlined")?.textContent).toBe("restaurant");
  });

  it("gives a note the default tile so the column never drops out", () => {
    const { container } = render(<CardSurface card={noteCard} dayDate="2027-08-31" />);
    const glyphs = Array.from(container.querySelectorAll(".material-symbols-outlined")).map((e) => e.textContent);
    expect(glyphs).toContain("edit_note");
    expect(container.querySelector("img")).toBeNull();
  });

  it("gives a place its photo inside the same tile", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("place_id=p1");
  });
});
