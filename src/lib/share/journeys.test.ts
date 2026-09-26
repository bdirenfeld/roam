import { describe, it, expect } from "vitest";
import { nearbyJourney, rankJourneys, journeyDistanceKm, NEARBY_KM } from "./journeys";
import type { ShareJourney } from "./journeys";

// Coordinates from the live database (26 Sep 2026): each journey's
// destination point plus a real pin on it.
const tuscany: ShareJourney = {
  id: "tus", title: "Tuscany", archived: false,
  points: [[43.5671, 10.9807], [43.7688, 11.2474] /* BABAE */, [43.7699, 11.2601] /* Vivoli */],
};
const palmSprings: ShareJourney = {
  id: "ps", title: "Palm Springs", archived: true, points: [[33.8303, -116.5453]],
};
const santaBarbara: ShareJourney = {
  id: "sb", title: "Santa Barbara Anniversary 2026", archived: true, points: [[34.4208, -119.6982]],
};
const puglia: ShareJourney = {
  id: "pu", title: "Italy 2027", archived: false, points: [[40.7928, 17.1012]],
};
const empty: ShareJourney = { id: "e", title: "No places yet", archived: false, points: [] };
const all = [palmSprings, santaBarbara, tuscany, puglia, empty];

describe("nearbyJourney", () => {
  it("files a Florence bar on Tuscany", () => {
    expect(nearbyJourney(all, 43.7688, 11.2475)?.id).toBe("tus");
  });

  it("reaches Elba through the journey's pins, not just its destination point", () => {
    // Portoferraio is ~107 km from the destination point but the rule is the
    // closest approach, so a pin on the coast would bring it closer still.
    expect(nearbyJourney(all, 42.8133, 10.3144)?.id).toBe("tus");
  });

  it("counts an archived journey when it is the only one close", () => {
    expect(nearbyJourney(all, 34.4285, -119.6628)?.id).toBe("sb"); // Montecito
  });

  it("prefers a live journey over an archived one when both are close", () => {
    const heldTuscany = { ...tuscany, id: "held", archived: true };
    expect(nearbyJourney([heldTuscany, tuscany], 43.77, 11.25)?.id).toBe("tus");
  });

  it("asks rather than guesses when nothing is within range", () => {
    expect(nearbyJourney(all, 36.3932, 25.4615)).toBeNull(); // Santorini
  });

  it("never picks a journey with no points", () => {
    expect(journeyDistanceKm(empty, 43.77, 11.25)).toBe(Number.POSITIVE_INFINITY);
    expect(nearbyJourney([empty], 43.77, 11.25)).toBeNull();
  });
});

describe("rankJourneys", () => {
  it("lists live journeys nearest first, archived after", () => {
    const order = rankJourneys(all, 36.3932, 25.4615).map((r) => r.journey.id);
    expect(order).toEqual(["pu", "tus", "e", "ps", "sb"]);
  });

  it("keeps the radius a real distance", () => {
    expect(NEARBY_KM).toBeGreaterThan(50);
    const km = rankJourneys([tuscany], 43.7688, 11.2474)[0]!.km;
    expect(km).toBeLessThan(1);
  });
});
