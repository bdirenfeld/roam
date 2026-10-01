import { describe, it, expect } from "vitest";
import { distanceLine } from "./distance";

// Sandra's Conrad Fort Lauderdale Beach and two dinners Find could return.
const conrad = { lat: 26.1300, lng: -80.1030 };

describe("how far a Find result is from the hotel", () => {
  it("a place next door is minutes on foot", () => {
    expect(distanceLine(conrad, { lat: 26.1330, lng: -80.1030 }, "the Conrad")).toBe("5 min walk from the Conrad");
  });
  it("never says 0 min", () => {
    expect(distanceLine(conrad, conrad, "the Conrad")).toBe("1 min walk from the Conrad");
  });
  it("further is kilometres, one decimal under ten", () => {
    // Earls at Dania Pointe, about 11 km south.
    expect(distanceLine(conrad, { lat: 26.0307, lng: -80.1450 }, "the Conrad")).toBe("12 km from the Conrad");
    expect(distanceLine(conrad, { lat: 26.1600, lng: -80.1030 }, "the Conrad")).toBe("3.3 km from the Conrad");
  });
});
