import { describe, it, expect } from "vitest";
import { pickOffers, dropReason, type Offer, type PickOpts } from "./pickOffers";
import { parseAsk } from "./wants";

/**
 * Real listings from real searches, because every bug he found in two seconds
 * came from a filter chain no test could call (11 Sept 2026).
 */
const LUCCA = { lat: 43.8431, lng: 10.5032 };

const offer = (o: Partial<Offer> & { name: string }): Offer => ({
  lat: LUCCA.lat, lng: LUCCA.lng, score: 4.9, reviews: 100,
  total: 5000, nightly: null, beds: 4, sleeps: 8, amenities: [], ...o,
});

/** Tuscany: seven people, eleven nights, four bedrooms needed. */
const TUSCANY: PickOpts = {
  party: 7, fitBedrooms: 4, nights: 11, ceiling: 590,
  ask: parseAsk(null), centre: LUCCA, maxKm: 35,
  skipNames: new Set(), taken: new Set(), preferred: new Set(), room: 5,
};

describe("the listing his eye caught", () => {
  // "One of them says it can accommodate our people so why is it even in the
  // results?" — Gallo Cedrone, sleeps 6, on a list for seven.
  const gallo = offer({ name: "Gallo Cedrone, a Home with Outdoor", beds: 3, sleeps: 6, total: null });

  it("drops a villa that says it sleeps fewer than the party", () => {
    expect(dropReason(gallo, TUSCANY)).toBe("sleeps too few");
    expect(pickOffers([gallo], TUSCANY)).toEqual([]);
  });

  it("keeps the same villa for a party it does fit", () => {
    expect(dropReason(gallo, { ...TUSCANY, party: 6, fitBedrooms: 3 })).toBeNull();
  });

  it("still allows a listing that says nothing about sleeping", () => {
    // Most do not say. Silence must not be read as a no.
    expect(dropReason(offer({ name: "Villa Quiet", sleeps: null }), TUSCANY)).toBeNull();
  });
});

describe("the other rules, each named", () => {
  it("drops a place nobody rates", () => {
    expect(dropReason(offer({ name: "New Place", reviews: 3 }), TUSCANY)).toBe("score");
    expect(dropReason(offer({ name: "Poor Place", score: 3.9 }), TUSCANY)).toBe("score");
  });

  it("drops one at more than twice the Estimate", () => {
    // Villa Buonamici: $16,930 over 11 nights is $1,539 a night against $590.
    expect(dropReason(offer({ name: "Villa Buonamici", total: 16930 }), TUSCANY)).toBe("budget");
    // And keeps one merely over it — that earns a flag, not a deletion.
    expect(dropReason(offer({ name: "The Healing Garden", total: 8468 }), TUSCANY)).toBeNull();
  });

  it("drops one an hour and a half out", () => {
    // Highland Springs Ranch landed on the Palm Springs list reading "adds
    // about 13 hours of driving over the trip" (10 Sept 2026).
    const far = offer({ name: "Highland Springs Ranch", lat: 43.0, lng: 11.9 });
    expect(dropReason(far, TUSCANY)).toBe("too far");
  });

  it("drops one already seen, and one already on the list", () => {
    expect(dropReason(offer({ name: "Casa Barbra" }), { ...TUSCANY, skipNames: new Set(["casa barbra"]) })).toBe("seen");
    expect(dropReason(offer({ name: "Casa Barbra" }), { ...TUSCANY, taken: new Set(["casa barbra"]) })).toBe("duplicate");
  });

  it("drops one that is two bedrooms short, keeps one that is a single short", () => {
    expect(dropReason(offer({ name: "Small", beds: 2 }), TUSCANY)).toBe("too few bedrooms");
    expect(dropReason(offer({ name: "Nearly", beds: 3 }), TUSCANY)).toBeNull();
  });

  it("drops one the listing says has no pool when a pool is a must", () => {
    const ask = parseAsk("we need a pool");
    const noPool = offer({ name: "Dry Villa", amenities: ["Kitchen", "Free parking"] });
    expect(dropReason(noPool, { ...TUSCANY, ask })).toBe("must-have");
    // Not listed at all is a third state and keeps its place.
    expect(dropReason(offer({ name: "Unknown", amenities: [] }), { ...TUSCANY, ask })).toBeNull();
  });
});

describe("the order and the count", () => {
  it("never returns more than there is room for", () => {
    const many = Array.from({ length: 9 }, (_, i) => offer({ name: `Villa ${i}` }));
    expect(pickOffers(many, { ...TUSCANY, room: 3 })).toHaveLength(3);
    expect(pickOffers(many, { ...TUSCANY, room: 0 })).toHaveLength(0);
  });

  it("puts the wanted inventory above the other one", () => {
    // A hotel with 3,000 reviews must not outrank a villa with thirty just
    // for being a hotel (10 Sept 2026).
    const villa = offer({ name: "Casa Daria", score: 4.9, reviews: 39 });
    const hotel = offer({ name: "Grand Hotel", score: 4.6, reviews: 3000 });
    const picked = pickOffers([hotel, villa], { ...TUSCANY, preferred: new Set(["casa daria"]) });
    expect(picked.map((o) => o.name)).toEqual(["Casa Daria", "Grand Hotel"]);
  });

  it("ranks by score weighted by how many people left one", () => {
    const few = offer({ name: "Few", score: 5.0, reviews: 21 });
    const many = offer({ name: "Many", score: 4.8, reviews: 900 });
    expect(pickOffers([few, many], TUSCANY).map((o) => o.name)).toEqual(["Many", "Few"]);
  });

  it("returns nothing rather than something wrong when every offer fails", () => {
    const all = [offer({ name: "A", sleeps: 2 }), offer({ name: "B", reviews: 1 })];
    expect(pickOffers(all, TUSCANY)).toEqual([]);
  });
});

describe("a journey with no Estimate has no ceiling", () => {
  it("drops nothing on price", () => {
    const dear = offer({ name: "Very Dear", total: 40000 });
    expect(dropReason(dear, { ...TUSCANY, ceiling: null })).toBeNull();
  });
});
