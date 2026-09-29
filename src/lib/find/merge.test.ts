import { describe, it, expect } from "vitest";
import { mergeFind, wellRated, fitsCategory, combineFind, samePlace, MAX_RESULTS, MAX_SHOWN, type FindResult } from "./merge";

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
  it("never more than MAX_RESULTS", () => {
    const many = Array.from({ length: 20 }, (_, i) => r("g" + i, "google"));
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
  it("travellers on top, one place once", () => {
    const g = Array.from({ length: 8 }, (_, i) => r("g" + i, "google"));
    const out = combineFind([r("t1", "travellers"), r("g0", "travellers")], g);
    expect(out.map((x) => x.placeId).slice(0, 3)).toEqual(["t1", "g0", "g1"]);
    expect(out).toHaveLength(9);
    expect(combineFind(undefined, [r("g0", "google")]).map((x) => x.placeId)).toEqual(["g0"]);
  });
});

describe("samePlace", () => {
  // Rome test 2, 29 Sep 2026: as Google returned them.
  const colosseo = r("t-col", "travellers", { name: "Colosseo", lat: 41.8902, lng: 12.4922 });
  const colosseum = r("g-col", "google", { name: "Colosseum", lat: 41.8902, lng: 12.4924 });
  const piazza = r("t-pan", "travellers", { name: "Piazza del Pantheon (Piazza della Rotonda)", lat: 41.8991, lng: 12.4768 });
  const pantheon = r("g-pan", "google", { name: "Pantheon", lat: 41.8986, lng: 12.4769 });
  const enzo = r("t-enzo", "travellers", { name: "Trattoria Da Enzo", lat: 41.8886, lng: 12.4771 });
  const tonnarello = r("g-ton", "google", { name: "Tonnarello", lat: 41.8893, lng: 12.4697 });
  const enzo29 = r("g-enzo", "google", { name: "Da Enzo al 29", lat: 41.8887, lng: 12.4772 });
  it("two names for one place, close together and sharing a stem", () => {
    expect(samePlace(colosseo, colosseum)).toBe(true);
    expect(samePlace(piazza, pantheon)).toBe(true);
    expect(samePlace(enzo, enzo29)).toBe(true);
  });
  it("neighbours with different names stay apart", () => {
    expect(samePlace(enzo, tonnarello)).toBe(false);
    expect(samePlace(colosseo, pantheon)).toBe(false);
  });
  it("combineFind keeps Google's listing with the traveller's reason", () => {
    const out = combineFind([{ ...colosseo, why: "Unmissable.", source: { name: "Blog", url: "https://x" } }], [colosseum, pantheon]);
    expect(out.map((x) => x.placeId)).toEqual(["g-col", "g-pan"]);
    expect(out[0]).toMatchObject({ name: "Colosseum", why: "Unmissable.", from: "travellers" });
  });
  it("shows up to twelve", () => {
    const g = Array.from({ length: 20 }, (_, i) => r("g" + i, "google", { name: "Place " + "abcdefghijklmnopqrst"[i].repeat(5), lat: 35 + i * 0.01 }));
    expect(combineFind([], g)).toHaveLength(MAX_SHOWN);
  });
});

describe("Rome test 2 fixes", () => {
  it("a metro station is never a place to visit", () => {
    expect(fitsCategory("self_directed", ["establishment", "point_of_interest", "subway_station", "transit_station"])).toBe(false);
    expect(fitsCategory("self_directed", ["locality", "political"])).toBe(true); // a town is a day trip
  });
  it("a place already on the journey under another listing is not offered again", () => {
    const ROME = { lat: 41.9, lng: 12.49 };
    const tourListing = r("g-tour", "google", { name: "Colosseum", lat: 41.8930, lng: 12.4893 });
    const out = mergeFind(ROME, [], [tourListing, r("g-trevi", "google", { name: "Trevi Fountain", lat: 41.9009, lng: 12.4833 })], new Set(), [{ name: "Colosseum", lat: 41.8902, lng: 12.4922 }]);
    expect(out.map((x) => x.placeId)).toEqual(["g-trevi"]);
  });
});

describe("samePlace, strict", () => {
  it("the same name close by is one place; a sibling name is not", () => {
    const at = (name: string, lat: number, lng: number) => r(`${name}@${lat}`, "google", { name, lat, lng });
    expect(samePlace(at("Colosseum", 41.8902, 12.4922), at("Colosseum", 41.8930, 12.4893), true)).toBe(true);
    expect(samePlace(at("Roscioli Caffè Pasticceria", 41.8935, 12.4745), at("Roscioli Salumeria con Cucina", 41.8940, 12.4735), true)).toBe(false);
    expect(samePlace(at("Colosseum", 41.8902, 12.4922), at("Colosseum", 41.95, 12.49), true)).toBe(false);
  });
});

describe("Costa Rica test fixes", () => {
  it("a tour company is a Tour, not Explore; a clothes shop is neither", () => {
    const tour = ["establishment", "point_of_interest", "travel_agency"];
    expect(fitsCategory("self_directed", tour)).toBe(false);
    expect(fitsCategory("guided", tour)).toBe(true);
    const shop = ["clothing_store", "establishment", "point_of_interest", "store"];
    expect(fitsCategory("self_directed", shop)).toBe(false);
    // A bookshop is Explore in Roam (his Strand and McNally Jackson), and so is a shop that is a sight.
    expect(fitsCategory("self_directed", ["book_store", "store", "point_of_interest"])).toBe(true);
    expect(fitsCategory("self_directed", ["clothing_store", "tourist_attraction"])).toBe(true);
  });
});

describe("a cooking class is a Tour", () => {
  it("keeps food-typed classes and food tours under Tour", () => {
    // InRome Cooking Classes, as Google types it.
    expect(fitsCategory("guided", ["establishment", "food", "point_of_interest", "restaurant"])).toBe(true);
    expect(fitsCategory("guided", ["subway_station", "transit_station"])).toBe(false);
  });
});

describe("chains", () => {
  it("one branch of a chain, the best placed", () => {
    const NY = { lat: 40.75, lng: -73.99 };
    const out = mergeFind(NY, [], [
      r("a", "google", { name: "787 Coffee", lat: 40.740, lng: -74.003, rating: 4.7, reviews: 900 }),
      r("b", "google", { name: "787 Coffee", lat: 40.774, lng: -73.956, rating: 4.6, reviews: 300 }),
      r("c", "google", { name: "787 coffee", lat: 40.760, lng: -73.988, rating: 4.5, reviews: 200 }),
      r("d", "google", { name: "Bird & Branch", lat: 40.760, lng: -73.991, rating: 4.6, reviews: 800 }),
    ], new Set());
    expect(out.map((x) => x.placeId)).toEqual(["a", "d"]);
  });
});
