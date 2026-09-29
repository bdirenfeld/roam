import { describe, it, expect } from "vitest";
import { nearCentres, withinWalk } from "./near";

// The New York test's sights, and the cafés Find brought back.
const P = (lat: number, lng: number) => ({ lat, lng });
const sights = [
  P(40.783, -73.966), P(40.775, -73.969), P(40.779, -73.969), P(40.781, -73.974), // Central Park
  P(40.748, -74.005), P(40.765, -73.999),                                         // High Line, Pier 86
  P(40.753, -73.979),                                                             // SUMMIT
  P(40.898, -73.911),                                                             // Wave Hill, the Bronx
];

describe("nearCentres", () => {
  it("finds where the sights cluster, busiest first, at most three", () => {
    const c = nearCentres(sights);
    expect(c).toHaveLength(3);
    expect(c[0].lat).toBeCloseTo(40.7795, 2); // the park
    expect(nearCentres([])).toEqual([]);
  });
});

describe("withinWalk", () => {
  it("keeps cafés near the day and drops the ones across the river", () => {
    const cafes = [
      { name: "Alice's Tea Cup", ...P(40.778, -73.979) },
      { name: "Café Grumpy Greenpoint", ...P(40.729, -73.949) },
      { name: "Partners Coffee LIC", ...P(40.748, -73.942) },
      { name: "Black Star Bakery", ...P(40.743, -73.958) },
    ];
    expect(withinWalk(cafes, nearCentres(sights)).map((c) => c.name)).toEqual(["Alice's Tea Cup"]);
    expect(withinWalk(cafes, [])).toHaveLength(4); // an empty map: the whole city
  });
});
