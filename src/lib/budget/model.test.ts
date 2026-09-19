import { describe, it, expect } from "vitest";
import { compute, defaultAssumptions, splitTotals, type Assumptions } from "./model";

/**
 * Splitting a journey between two households.
 *
 * The numbers below are Tuscany, Aug 2027: five Direnfelds and two
 * grandparents, eleven nights at Villa Bottino with one van. That is the
 * journey the feature was built for, so it is the one the tests use.
 */

const NO_EXCURSIONS = { uncostedExcursions: 0, rolledExcursionCount: 0 };

function tuscany(over: Partial<Assumptions> = {}): Assumptions {
  return {
    ...defaultAssumptions(7, 11),
    people: 7,
    nights: 11,
    days: 11,
    flightPerPerson: 1400,   // person  → 7 × 1400 = 9800
    nightlyRate: 900,        // shared  → 11 × 900 = 9900
    groceriesPerDay: 0,
    perMealOut: 0,
    mealsOut: 0,
    excursionsTotal: 0,
    carEnabled: true,
    carDayRate: 100,         // shared  → 11 × 100 = 1100
    dogEnabled: true,
    dogNightlyRate: 50,      // ours    → 12 × 50  = 600
    dogNights: 12,
    extrasEnabled: false,
    touristTaxEnabled: false,
    contingencyPct: 0,
    pointsCredit: 0,
    guestPeople: 2,
    guestSharePct: 33,
    ...over,
  };
}

describe("splitTotals", () => {
  it("divides per-person lines by headcount and shared lines by the percentage", () => {
    const a = tuscany();
    const e = compute(a, NO_EXCURSIONS);
    const s = e.split!;

    // Flights 9800 × 2/7 = 2800. Villa 9900 × 33% = 3267. Van 1100 × 33% = 363.
    // Dog 600 is ours. 2800 + 3267 + 363 = 6430.
    expect(s.guests).toBe(6430);
    expect(s.usPeople).toBe(5);
    expect(s.guestPeople).toBe(2);
  });

  it("always adds back up to the total — this is the property that matters", () => {
    for (const over of [
      {},
      { contingencyPct: 10 },
      { pointsCredit: 2500 },
      { contingencyPct: 15, pointsCredit: 1200 },
      { guestSharePct: 50 },
      { guestSharePct: 0 },
      { guestSharePct: 100 },
      { guestPeople: 1 },
      { guestPeople: 6 },
    ]) {
      const e = compute(tuscany(over), NO_EXCURSIONS);
      expect(e.split!.us + e.split!.guests).toBe(e.total);
    }
  });

  it("never charges the guests for the dog or the gifts", () => {
    // Everything per-person and shared removed: only "ours" lines remain.
    const e = compute(
      tuscany({ flightPerPerson: 0, nightlyRate: 0, carEnabled: false, extrasEnabled: true, extrasPerDay: 40 }),
      NO_EXCURSIONS,
    );
    expect(e.split!.guests).toBe(0);
    expect(e.split!.us).toBe(e.total);
  });

  it("charges the guests nothing shared at 0% and the whole shared bill at 100%", () => {
    const none = compute(tuscany({ guestSharePct: 0 }), NO_EXCURSIONS).split!;
    const all = compute(tuscany({ guestSharePct: 100 }), NO_EXCURSIONS).split!;
    expect(none.guests).toBe(2800);          // flights only
    expect(all.guests).toBe(2800 + 9900 + 1100);
  });

  it("carries contingency and points in proportion, not evenly", () => {
    const s = compute(tuscany({ contingencyPct: 10 }), NO_EXCURSIONS).split!;
    // Guests are 6430 of 21400 base; 10% contingency is 2140, their share 643.
    expect(s.guests).toBe(7073);
  });

  it("clamps a guest count above the party and a percentage outside 0–100", () => {
    const over = compute(tuscany({ guestPeople: 99 }), NO_EXCURSIONS).split!;
    expect(over.guestPeople).toBe(7);
    expect(over.usPeople).toBe(0);

    const wild = compute(tuscany({ guestSharePct: 400 }), NO_EXCURSIONS).split!;
    expect(wild.guests).toBe(2800 + 9900 + 1100);   // treated as 100%
  });

  it("survives an empty journey without dividing by zero", () => {
    const a = tuscany({ people: 0, guestPeople: 0 });
    const s = splitTotals(compute(a, NO_EXCURSIONS).lines, a, 0, 0);
    expect(Number.isFinite(s.guests)).toBe(true);
    expect(s.guests).toBe(0);
  });
});

describe("compute", () => {
  it("omits the split entirely when nobody else is coming", () => {
    expect(compute(tuscany({ guestPeople: 0 }), NO_EXCURSIONS).split).toBeUndefined();
    expect(compute(tuscany({ guestPeople: 2 }), NO_EXCURSIONS).split).toBeDefined();
  });

  it("starts a new journey with no guests and a third as the opening share", () => {
    const d = defaultAssumptions(5, 11);
    expect(d.guestPeople).toBe(0);
    expect(d.guestSharePct).toBe(33);
  });
});
