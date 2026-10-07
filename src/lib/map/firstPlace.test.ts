import { describe, it, expect } from "vitest";
import { firstPlaceLine, hasPlacedCard, townOf, PIN_TO_DAY } from "./firstPlace";

/** The journey's first place gets its own line (7 Oct 2026, delight audit). */
describe("firstPlaceLine", () => {
  it("names the town on the first save of an empty journey", () => {
    expect(firstPlaceLine({ hadPlaces: false, destination: "Irving, Texas" })).toBe("Your first place for Irving. Tap its pin to put it on a day.");
  });
  it("keeps the door's own second sentence", () => {
    expect(firstPlaceLine({ hadPlaces: false, destination: "Rome", next: "Drag its pin onto the week." })).toBe("Your first place for Rome. Drag its pin onto the week.");
  });
  it("says nothing new once the journey has a place, or with no destination to name", () => {
    expect(firstPlaceLine({ hadPlaces: true, destination: "Rome, Italy" })).toBeNull();
    expect(firstPlaceLine({ hadPlaces: false, destination: "" })).toBeNull();
    expect(firstPlaceLine({ hadPlaces: false, destination: null })).toBeNull();
  });
  it("the old line's tail is the default", () => {
    expect(PIN_TO_DAY).toBe("Tap its pin to put it on a day.");
  });
});

describe("townOf", () => {
  it("takes the first comma-part, trimmed", () => {
    expect(townOf("  Tokyo , Japan")).toBe("Tokyo");
    expect(townOf("Romania")).toBe("Romania");
    expect(townOf(undefined)).toBeNull();
  });
});

describe("hasPlacedCard", () => {
  it("counts a card with a pinned place, saved or on a day; not a bare note", () => {
    expect(hasPlacedCard([])).toBe(false);
    expect(hasPlacedCard([{ place: null }, { place: { lat: null, lng: 1 } }])).toBe(false);
    expect(hasPlacedCard([{ place: null }, { place: { lat: 41.9, lng: 12.5 } }])).toBe(true);
  });
});
