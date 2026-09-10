import { describe, it, expect } from "vitest";
import { nightlyCeiling, nightlyOf, budgetVerdict, budgetFlag, OVER, FAR_OVER } from "./budget";

describe("nightlyCeiling", () => {
  it("takes the Estimate's rate, and refuses a zero or a missing one", () => {
    expect(nightlyCeiling(580)).toBe(580);
    expect(nightlyCeiling(0)).toBeNull();       // the Estimate exists but is untouched
    expect(nightlyCeiling(undefined)).toBeNull();
    expect(nightlyCeiling("580")).toBeNull();   // assumptions is loose JSON
  });
});

describe("nightlyOf", () => {
  it("prefers the quoted nightly, then works it out from the total", () => {
    expect(nightlyOf(330, 4288, 13)).toBe(330);
    expect(nightlyOf(null, 10381, 11)).toBeCloseTo(943.7, 1);
    expect(nightlyOf(null, null, 11)).toBeNull();
    expect(nightlyOf(null, 4288, 0)).toBeNull();
  });
});

describe("budgetVerdict", () => {
  const ceiling = 580;
  it("passes anything at or under the rate", () => {
    expect(budgetVerdict(400, ceiling)).toBe("within");
    expect(budgetVerdict(580, ceiling)).toBe("within");
  });

  it("tolerates a quarter over before flagging", () => {
    expect(budgetVerdict(ceiling * OVER, ceiling)).toBe("within");
    expect(budgetVerdict(ceiling * OVER + 1, ceiling)).toBe("over");
  });

  it("calls double the rate too far out to bother showing", () => {
    expect(budgetVerdict(ceiling * FAR_OVER, ceiling)).toBe("over");
    expect(budgetVerdict(ceiling * FAR_OVER + 1, ceiling)).toBe("far");
  });

  it("never guesses when a number is missing", () => {
    expect(budgetVerdict(null, ceiling)).toBeNull();
    expect(budgetVerdict(900, null)).toBeNull();
  });
});

describe("budgetFlag", () => {
  it("names his own number rather than saying 'over budget'", () => {
    expect(budgetFlag(900, 580)).toBe("Over your Estimate ($580 a night)");
    expect(budgetFlag(1400, 580)).toBe("Over your Estimate ($580 a night)");
  });

  it("says nothing when the place is within, or when there is no ceiling", () => {
    expect(budgetFlag(400, 580)).toBeNull();
    expect(budgetFlag(900, null)).toBeNull();
    expect(budgetFlag(null, 580)).toBeNull();
  });

  // Villa La Magnolia, the Tuscany pick: $10,381 over 11 nights against a
  // party-of-five seed of 150 + 110 x 3 bedrooms.
  it("judges the real Tuscany villa against the real seeded rate", () => {
    const nightly = nightlyOf(null, 10381, 11) as number;
    expect(budgetVerdict(nightly, 480)).toBe("over");
    expect(budgetVerdict(nightly, 1000)).toBe("within");
  });
});
