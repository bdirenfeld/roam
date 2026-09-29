import { describe, it, expect } from "vitest";
import { mergeFind, wellRated, fitsCategory, combineFind, MAX_RESULTS, type FindResult } from "./merge";

const KYOTO = { lat: 35.0116, lng: 135.7681 };
const r = (placeId: string, from: FindResult["from"], extra: Partial<FindResult> = {}): FindResult => ({
  placeId, name: placeId, address: "", lat: 35.0, lng: 135.76, rating: 4.6, reviews: 5000, why: "", source: null, from, kids: false, ...extra,
});

describe("mergeFind", () => {
  it("travellers first, then Google by rating and reviews", () => {
    const out = mergeFind(KYOTO, [r("t1", "travellers")], [r("g-low", "google", { rating: 4.4, reviews: 200 }), r("g-high", "google", { rating: 4.7, reviews: 20000 })], new Set());
    expect(out.map((x) => x.placeId)).toEqual(["t1", "g-high", "g-low"]);
  });
  it("one place once, nothing already on the journey, nothing in another city", () => {
    const out = mergeFind(KYOTO,
      [r("same", "travellers"), r("tokyo-branch", "travellers", { lat: 35.68, lng: 139.76 }), r("saved", "travellers")],
      [r("same", "google")],
      new Set(["saved"]));
    expect(out.map((x) => x.placeId)).toEqual(["same"]);
  });
  it("Google places must be well rated; a traveller's pick need not be", () => {
    const out = mergeFind(KYOTO, [r("small-gem", "travellers", { rating: 4.1, reviews: 40 })], [r("meh", "google", { rating: 4.0, reviews: 3000 })], new Set());
    expect(out.map((x) => x.placeId)).toEqual(["small-gem"]);
    expect(wellRated(4.3, 100)).toBe(true);
    expect(wellRated(4.8, 20)).toBe(false);
  });
  it("never more than eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => r("g" + i, "google"));
    expect(mergeFind(KYOTO, [], many, new Set())).toHaveLength(MAX_RESULTS);
  });
});

describe("fitsCategory", () => {
  it("keeps somewhere to eat out of the sights, and sights out of the food", () => {
    // Boccione, as Google types it.
    const bakery = ["bakery", "food", "point_of_interest", "store", "establishment"];
    expect(fitsCategory("self_directed", bakery)).toBe(false);
    expect(fitsCategory("dessert", bakery)).toBe(true);
    expect(fitsCategory("self_directed", ["museum", "point_of_interest"])).toBe(true);
    // A market is a sight AND food: a sight may be both.
    expect(fitsCategory("self_directed", ["tourist_attraction", "food"])).toBe(true);
    expect(fitsCategory("restaurant", ["tourist_attraction", "point_of_interest"])).toBe(false);
    expect(fitsCategory("guided", ["travel_agency", "point_of_interest"])).toBe(true);
    expect(fitsCategory("self_directed", undefined)).toBe(true);
  });
});

describe("combineFind", () => {
  it("travellers on top, one place once, eight at most", () => {
    const g = Array.from({ length: 8 }, (_, i) => r("g" + i, "google"));
    const out = combineFind([r("t1", "travellers"), r("g0", "travellers")], g);
    expect(out.map((x) => x.placeId).slice(0, 3)).toEqual(["t1", "g0", "g1"]);
    expect(out).toHaveLength(MAX_RESULTS);
    expect(combineFind(undefined, [r("g0", "google")]).map((x) => x.placeId)).toEqual(["g0"]);
  });
});
