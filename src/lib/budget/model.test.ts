import { describe, it, expect } from "vitest";
import { cardBudgetToCad, compute, defaultAssumptions, migrateAssumptions, splitTotals, suggest, type Assumptions } from "./model";

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

  it("never charges the guests for the dog", () => {
    // Everything per-person and shared removed: only "ours" lines remain.
    const e = compute(
      tuscany({ flightPerPerson: 0, nightlyRate: 0, carEnabled: false }),
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

  it("carries contingency in proportion, not evenly", () => {
    const s = compute(tuscany({ contingencyPct: 10 }), NO_EXCURSIONS).split!;
    // Guests are 6430 of 21400 base; 10% contingency is 2140, their share 643.
    expect(s.guests).toBe(7073);
  });

  it("takes points off your side only — they are your points", () => {
    const base = compute(tuscany(), NO_EXCURSIONS).split!;
    const withPoints = compute(tuscany({ pointsCredit: 5000 }), NO_EXCURSIONS).split!;
    expect(withPoints.guests).toBe(base.guests);        // untouched
    expect(withPoints.us).toBe(base.us - 5000);         // all of it
  });

  it("only spills onto the guests once the credit exceeds your whole share", () => {
    const plain = compute(tuscany(), NO_EXCURSIONS).split!;
    // 21400 base, guests 6430, so your side is 14970. Redeem more than that.
    const huge = compute(tuscany({ pointsCredit: 16000 }), NO_EXCURSIONS).split!;
    expect(plain.us).toBe(14970);
    expect(huge.us).toBe(0);
    expect(huge.guests).toBe(plain.guests - (16000 - plain.us));
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

// 27 Sep 2026: a family of five on a 7-night Mediterranean cruise.
describe("a cruise", () => {
  const a = { ...defaultAssumptions(5, 7), nightlyRate: 480, cruiseFarePerPerson: 1330, groceriesPerDay: 110, carEnabled: true, carDayRate: 210 };
  const opts = { uncostedExcursions: 0, rolledExcursionCount: 0 };
  it("prices a fare per person instead of hotel nights, with no groceries or car", () => {
    const est = compute(a, { ...opts, cruise: true });
    const keys = est.lines.map((l) => l.key);
    expect(keys).not.toContain("groceries");
    expect(keys).not.toContain("car");
    const fare = est.lines.find((l) => l.key === "accommodation")!;
    expect(fare.label).toBe("Cruise fare");
    expect(fare.amount).toBe(1330 * 5);
    expect(fare.countLabel).toBe("people");
  });
  it("leaves every other journey as it was", () => {
    const est = compute(a, opts);
    expect(est.lines.find((l) => l.key === "accommodation")!.amount).toBe(480 * 7);   // the villa rate, untouched
    expect(est.lines.map((l) => l.key)).toContain("groceries");
  });
  it("suggests a fare for the sailing, per person", () => {
    const s = suggest(a, { distanceKm: 6500, peak: false, cruise: true });
    expect(s.values.cruiseFarePerPerson).toBe(1330);
    expect(s.basis.accommodation).toContain("per person");
  });
});

// 27 Sep 2026: Dog boarding was on for everyone.
describe("the dog follows the person, not Brennan", () => {
  it("is off with nothing to go on", () => {
    const a = defaultAssumptions(8, 3);
    expect(a.dogEnabled).toBe(false);
    expect(a.customLines).toEqual([]);
  });
  it("follows the last journey's choice", () => {
    const a = defaultAssumptions(5, 7, false, false, { dog: true });
    expect(a.dogEnabled).toBe(true);
    expect(defaultAssumptions(5, 7, true, false, { dog: true }).dogEnabled).toBe(false); // at home, no boarding
  });
});

// The one FX step, with a home that is not Canada (6 Oct 2026).
describe("cardBudgetToCad follows the person's home currency", () => {
  it("a budget already in the home currency needs no rate", () => {
    expect(cardBudgetToCad({ amount: 100, currency: "USD", per: "party" }, 2, 1.16, "USD")).toBe(100);
    expect(cardBudgetToCad({ amount: 100, currency: "local", per: "person" }, 2, 1.16, "USD")).toBeCloseTo(232, 6);
  });
  it("CAD stays the default home", () => {
    expect(cardBudgetToCad({ amount: 100, currency: "CAD", per: "party" }, 2, 1.6)).toBe(100);
    expect(cardBudgetToCad({ amount: 100, currency: "USD", per: "party" }, 2, 1.6)).toBe(160);
  });
});

// The suggested prices were Canadian-dollar figures for everyone (7 Oct
// 2026). They are priors in CAD, carried into the person's own money.
describe("suggest in the person's home currency", () => {
  const a = defaultAssumptions(4, 7);
  const ctx = { distanceKm: 6500, peak: false };

  it("a Canadian, or nothing said, sees exactly what they saw before", () => {
    const before = suggest(a, ctx);
    expect(suggest(a, { ...ctx, home: "CAD", cadToHome: 1, from: "Toronto" })).toEqual(before);
    expect(before.values.groceriesPerDay).toBe(90);
    expect(before.values.dogNightlyRate).toBe(75);
    expect(before.basis.groceries).toBe("$22 per person per day × 4");
    expect(before.basis.flights).toBe("6,500 km from Toronto · long-haul");
  });

  it("an American sees US dollars, written $", () => {
    const s = suggest(a, { ...ctx, home: "USD", cadToHome: 0.725, from: "New York" });
    // 22 × 4 × 0.725 = 63.8 → 60; 57 × 4 × 0.725 = 165.3 → 170; fare 1050 × 0.725 = 761 → 760.
    expect(s.values.groceriesPerDay).toBe(60);
    expect(s.values.perMealOut).toBe(170);
    expect(s.values.flightPerPerson).toBe(760);
    expect(s.basis.groceries).toBe("$16 per person per day × 4");
    expect(s.basis.flights).toBe("6,500 km from New York · long-haul");
  });

  it("a Briton sees pounds, written £, measured from London", () => {
    const s = suggest(a, { distanceKm: 340, peak: false, home: "GBP", cadToHome: 0.536, from: "London" });
    expect(s.basis.restaurants).toBe("£31 a head × 4");
    expect(s.basis.flights).toBe("340 km from London · short-haul");
    expect(s.values.flightPerPerson).toBe(130); // 240 × 0.536 = 128.6
  });
});

// 13 Oct 2026 (Brennan): Car hire into Standard with its tick, Restaurants and
// Groceries under Food, Gifts and Tourist tax out, your own lines in.
describe("the 13 Oct 2026 layout", () => {
  const a = tuscany({ guestPeople: 0, groceriesPerDay: 100, perMealOut: 300, mealsOut: 5 });
  it("puts Car hire in Standard, still with a tick, and Food's two rows after it", () => {
    const e = compute(a, NO_EXCURSIONS);
    const std = e.lines.filter((l) => l.group === "standard").map((l) => l.key);
    expect(std).toEqual(["flights", "accommodation", "car", "restaurants", "groceries", "excursions"]);
    expect(e.lines.find((l) => l.key === "car")!.enabledKey).toBe("carEnabled");
    expect(e.lines.filter((l) => l.parent === "food").map((l) => l.key)).toEqual(["restaurants", "groceries"]);
    expect(e.lines.filter((l) => l.group === "additional").map((l) => l.key)).toEqual(["dog"]);
  });
  it("drops an unticked car from the total and keeps its rate", () => {
    const on = compute(a, NO_EXCURSIONS);
    const off = compute({ ...a, carEnabled: false }, NO_EXCURSIONS);
    expect(on.total - off.total).toBe(1100);
    expect(off.lines.find((l) => l.key === "car")!.unit).toBe(100);
  });
  it("adds your own lines to Additional and to the total, shared like the villa", () => {
    const base = compute(a, NO_EXCURSIONS);
    const e = compute({ ...a, customLines: [{ id: "x", label: "Ski passes", amount: 1200 }] }, NO_EXCURSIONS);
    const line = e.lines.find((l) => l.customId === "x")!;
    expect(line).toMatchObject({ group: "additional", label: "Ski passes", amount: 1200, share: "shared", enabled: true });
    expect(e.total - base.total).toBe(1200);
  });
});

describe("migrateAssumptions", () => {
  // Japan's saved budget on 13 Oct 2026: Gifts on at $50 a day for 13 days.
  const japan = { ...defaultAssumptions(5, 13), extrasEnabled: true, extrasPerDay: 50, touristTaxEnabled: false, touristTaxPerNight: 15 } as Assumptions;
  it("turns a Gifts line that was on into a line of your own with the same figure", () => {
    const m = migrateAssumptions(japan);
    expect(m.customLines).toEqual([{ id: "gifts", label: "Gifts", amount: 650 }]);
    expect(m).not.toHaveProperty("extrasEnabled");
    expect(m).not.toHaveProperty("touristTaxPerNight");
  });
  it("keeps the total exactly where it was", () => {
    const before = compute({ ...defaultAssumptions(5, 13), customLines: [{ id: "g", label: "g", amount: 650 }] }, NO_EXCURSIONS).total;
    expect(compute(migrateAssumptions(japan), NO_EXCURSIONS).total).toBe(before);
  });
  it("adds nothing for Gifts that was off, and is safe to run twice", () => {
    expect(migrateAssumptions({ ...japan, extrasEnabled: false } as Assumptions).customLines).toEqual([]);
    const twice = migrateAssumptions(migrateAssumptions(japan));
    expect(twice.customLines).toHaveLength(1);
  });
});
