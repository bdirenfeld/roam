import { describe, it, expect } from "vitest";
import { blendNightly, accommodationBasis, type StayLeg } from "./lodgingLine";

const leg = (label: string, nights: number, nightly: number | null): StayLeg => ({ label, nights, nightly });

// Japan as it stands: Tokyo eight nights, Osaka five.
const JAPAN = [leg("Tokyo", 8, 640), leg("Osaka", 5, 520)];

describe("blendNightly", () => {
  it("weights by nights, so the total comes out right", () => {
    expect(blendNightly(JAPAN)).toBe(594);
    // The point of the weighting: 594 x 13 nights is the real spend.
    expect(594 * 13).toBe(7722);
    expect(8 * 640 + 5 * 520).toBe(7720);
  });

  it("is just the rate when there is one stay", () => {
    expect(blendNightly([leg("Lucca", 11, 944)])).toBe(944);
  });

  it("handles a long trip with many stays, not just two", () => {
    // Two months, six places — the case he asked for.
    const sabbatical = [
      leg("Lisbon", 14, 210), leg("Porto", 7, 180), leg("Seville", 10, 240),
      leg("Granada", 7, 195), leg("Valencia", 12, 225), leg("Barcelona", 10, 310),
    ];
    const nights = sabbatical.reduce((n, l) => n + l.nights, 0);
    const spend = sabbatical.reduce((s, l) => s + (l.nightly as number) * l.nights, 0);
    expect(nights).toBe(60);
    expect(blendNightly(sabbatical)).toBe(Math.round(spend / nights));
  });

  it("ignores a stay with no price rather than counting it as free", () => {
    expect(blendNightly([leg("Tokyo", 8, 640), leg("Osaka", 5, null)])).toBe(640);
  });

  it("gives nothing back when nothing is priced, so the Estimate keeps what it had", () => {
    expect(blendNightly([leg("Tokyo", 8, null)])).toBeNull();
    expect(blendNightly([])).toBeNull();
    expect(blendNightly([leg("Tokyo", 0, 640)])).toBeNull();
  });
});

describe("accommodationBasis", () => {
  it("shows the working, so the blended number is never a mystery", () => {
    expect(accommodationBasis(JAPAN)).toBe("Tokyo 8 × $640 + Osaka 5 × $520");
  });

  it("stops listing past three stays — this sits on one row", () => {
    const six = [
      leg("Lisbon", 14, 210), leg("Porto", 7, 180), leg("Seville", 10, 240),
      leg("Granada", 7, 195), leg("Valencia", 12, 225), leg("Barcelona", 10, 310),
    ];
    expect(accommodationBasis(six))
      .toBe("Lisbon 14 × $210 + Porto 7 × $180 + Seville 10 × $240 + 3 more");
  });

  it("says when the rate covers only some of the stays", () => {
    // Three bases, two chosen: the rate is an average of those two and the
    // Estimate applies it to every night.
    expect(accommodationBasis(JAPAN, 3)).toBe("Tokyo 8 × $640 + Osaka 5 × $520 · 2 of 3 stays");
    expect(accommodationBasis(JAPAN, 2)).toBe("Tokyo 8 × $640 + Osaka 5 × $520");
  });

  it("says nothing at all when nothing is priced", () => {
    expect(accommodationBasis([leg("Tokyo", 8, null)])).toBeNull();
    expect(accommodationBasis([])).toBeNull();
  });
});
