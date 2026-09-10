import { describe, it, expect } from "vitest";
import { parseBudget, budgetHint, budgetFieldValue } from "./budgetInput";

const NIGHTS = 7; // Palm Springs, 13–20 March.

describe("parseBudget", () => {
  it("reads a bare number as a nightly rate, which is what the field asks for", () => {
    expect(parseBudget("480", NIGHTS)).toEqual({ nightly: 480, fromTotal: false });
    expect(parseBudget("$480", NIGHTS)).toEqual({ nightly: 480, fromTotal: false });
    expect(parseBudget("1,200", NIGHTS)).toEqual({ nightly: 1200, fromTotal: false });
  });

  it("still reads a nightly rate when they spell it out", () => {
    expect(parseBudget("$480 a night", NIGHTS).nightly).toBe(480);
    expect(parseBudget("480 per night", NIGHTS).nightly).toBe(480);
    expect(parseBudget("$480/night", NIGHTS).nightly).toBe(480);
  });

  it("divides a whole-stay figure down, because people think in both", () => {
    expect(parseBudget("9000 total", NIGHTS)).toEqual({ nightly: 1286, fromTotal: true });
    expect(parseBudget("$9,000 all in", NIGHTS)).toEqual({ nightly: 1286, fromTotal: true });
    expect(parseBudget("10500 for the whole trip", NIGHTS)).toEqual({ nightly: 1500, fromTotal: true });
    // His own framing: $15K all-in per trip.
    expect(parseBudget("$15,000 in total", NIGHTS).nightly).toBe(2143);
  });

  it("lets an explicit nightly win over the word total", () => {
    expect(parseBudget("$480 a night total budget", NIGHTS)).toEqual({ nightly: 480, fromTotal: false });
  });

  it("gives nothing back for nothing usable", () => {
    expect(parseBudget("", NIGHTS)).toEqual({ nightly: null, fromTotal: false });
    expect(parseBudget(null, NIGHTS)).toEqual({ nightly: null, fromTotal: false });
    expect(parseBudget("as cheap as possible", NIGHTS)).toEqual({ nightly: null, fromTotal: false });
    expect(parseBudget("0", NIGHTS)).toEqual({ nightly: null, fromTotal: false });
    expect(parseBudget("-50", NIGHTS).nightly).toBe(50); // the minus is not a number character here
  });

  it("does not divide by zero on a journey with no nights", () => {
    expect(parseBudget("9000 total", 0)).toEqual({ nightly: 9000, fromTotal: false });
  });
});

describe("budgetHint", () => {
  it("shows the whole stay, so a second box is never needed", () => {
    expect(budgetHint(480, 7)).toBe("about $3,360 for 7 nights");
    expect(budgetHint(1200, 1)).toBe("about $1,200 for 1 night");
  });

  it("says nothing when there is no number yet", () => {
    expect(budgetHint(null, 7)).toBeNull();
    expect(budgetHint(0, 7)).toBeNull();
    expect(budgetHint(480, 0)).toBeNull();
  });
});

describe("budgetFieldValue", () => {
  it("opens on the Estimate's own number, which is the point of the field", () => {
    expect(budgetFieldValue(480)).toBe("480");
    expect(budgetFieldValue(479.6)).toBe("480");
  });

  it("opens empty when the journey has no Estimate — Santa Barbara had none", () => {
    expect(budgetFieldValue(null)).toBe("");
    expect(budgetFieldValue(0)).toBe("");
    expect(budgetFieldValue(undefined)).toBe("");
  });
});
