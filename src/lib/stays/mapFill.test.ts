import { describe, it, expect } from "vitest";
import { mapFill, exhaustedNote, repeatNote } from "./mapFill";

/**
 * The Osaka case, 11 Sept 2026. Three searches in, the priced hotels were
 * used up and the list was topped up from the map until four of five rows
 * had no price at all — and nothing said so.
 */
describe("mapFill", () => {
  it("does not pad a thin list with rows that can never have a price", () => {
    // One priced offer, four slots free, plenty on the map. That is exactly
    // what produced "none of the Osaka places have a price".
    expect(mapFill({ have: 1, priced: 1, available: 12, want: 5 }))
      .toEqual({ take: 0, exhausted: true });
  });

  it("does fill an empty list, because the map beats a blank screen", () => {
    // Tuscany: the villas are only on the map and nothing is bookable.
    expect(mapFill({ have: 0, priced: 0, available: 8, want: 5 }))
      .toEqual({ take: 5, exhausted: false });
  });

  it("takes only what the map actually has", () => {
    expect(mapFill({ have: 0, priced: 0, available: 2, want: 5 }))
      .toEqual({ take: 2, exhausted: false });
  });

  it("adds nothing to a full list", () => {
    expect(mapFill({ have: 5, priced: 5, available: 9, want: 5 }))
      .toEqual({ take: 0, exhausted: false });
  });

  it("treats saved-but-unpriced rows as no price at all", () => {
    // Tuscany again: two saved villas on the list, neither bookable, so the
    // map is still the only source.
    expect(mapFill({ have: 2, priced: 0, available: 6, want: 5 }))
      .toEqual({ take: 3, exhausted: false });
  });
});

describe("exhaustedNote", () => {
  it("says the area is used up rather than pretending the search failed", () => {
    expect(exhaustedNote("Osaka", 1, 14))
      .toBe("1 left around Osaka that anyone is quoting. The 14 you have already seen are under “14 earlier”.");
  });

  it("says so plainly when a run turns up nothing new", () => {
    expect(exhaustedNote("Lucca", 0, 9))
      .toBe("Nothing new around Lucca this time. The 9 you have already seen are under “9 earlier”.");
  });

  it("leaves the pointer out when there is nothing set aside", () => {
    expect(exhaustedNote("Osaka", 2, 0)).toBe("2 left around Osaka that anyone is quoting.");
  });
});

describe("repeatNote", () => {
  it("says nothing when the list is all new", () => {
    expect(repeatNote("Osaka", 0, 5)).toBeNull();
  });

  it("says plainly when a run found nothing new at all", () => {
    expect(repeatNote("Osaka", 5, 0))
      .toBe("Nothing new around Osaka — these are the best of the ones you have seen. Start over to clear what the search remembers.");
  });

  it("counts the repeats when some of the list is fresh", () => {
    expect(repeatNote("Osaka", 2, 3))
      .toBe("2 of these are places you have seen before; nothing else around Osaka is quoting a price.");
    expect(repeatNote("Lucca", 1, 4))
      .toBe("One of these is a place you have seen before; nothing else around Lucca is quoting a price.");
  });
});
