import { describe, it, expect } from "vitest";
import { fmtMinutes, driveHours, driveLine, driveDelta, usableAnchorIndexes } from "./drive";

describe("usableAnchorIndexes", () => {
  const anchors = [{ kind: "evening" }, { kind: "airport" }, { kind: "daytrip" }, { kind: "daytrip" }];
  it("drops a day trip that is really a second base: Tokyo to Kagoshima at 21 h", () => {
    expect(usableAnchorIndexes(anchors, [0, 45, 70, 1304])).toEqual([0, 1, 2]);
  });
  it("keeps everything Google could not route, and never drops the evening or the airport", () => {
    expect(usableAnchorIndexes(anchors, [0, 400, null, 120])).toEqual([0, 1, 2, 3]);
  });
});

/**
 * Google drive minutes fetched 2026-09-09 for the Tuscany anchors, in the
 * order: Pisa airport ×2, Lucca ×4 evenings, cooking class ×1, Volterra ×1,
 * Colonnata ×1, Florence ×2, truffle hunt ×1, La Spezia ×1, Locanda di Sesto ×1.
 */
const WEIGHTS = [2, 4, 1, 1, 1, 2, 1, 1, 1];
const MAGNOLIA = [32, 16, 57, 84, 58, 67, 50, 60, 24];
const BOTTINO  = [47, 23, 77, 104, 67, 84, 70, 70, 24];

describe("fmtMinutes", () => {
  it("says minutes under an hour, hours and minutes above", () => {
    expect(fmtMinutes(10)).toBe("10 min");
    expect(fmtMinutes(60)).toBe("1 h");
    expect(fmtMinutes(84)).toBe("1 h 24");
    expect(fmtMinutes(null)).toBe("—");
  });
});

describe("driveHours", () => {
  it("matches the figures on the homebase brief: Magnolia 19.8 h, Bottino 25.5 h", () => {
    expect(driveHours(MAGNOLIA, WEIGHTS)).toBe(19.8);
    expect(driveHours(BOTTINO, WEIGHTS)).toBe(25.5);
  });
  it("skips an anchor Google could not route to", () => {
    expect(driveHours([30, null], [1, 5])).toBe(1);
  });
});

describe("driveLine", () => {
  it("reads the way you would say it", () => {
    expect(driveLine([
      { label: "Lucca", minutes: 10 },
      { label: "airport", minutes: 30 },
      { label: "Volterra", minutes: 84 },
    ])).toBe("Lucca 10 min · airport 30 · Volterra 1 h 24");
  });
  it("drops parts with no road", () => {
    expect(driveLine([{ label: "Lucca", minutes: 10 }, { label: "island", minutes: null }])).toBe("Lucca 10 min");
  });
});

describe("driveDelta", () => {
  it("names the cost of Bottino against the best-placed villa", () => {
    expect(driveDelta(25.5, 19.6)).toBe("Adds about 6 hours of driving over the trip");
    expect(driveDelta(23.4, 19.6)).toBe("Adds about 4 hours of driving over the trip");
    expect(driveDelta(21.1, 19.6)).toBe("Adds about 1.5 hours of driving over the trip");
    expect(driveDelta(20.6, 19.6)).toBe("Adds about 1 hour of driving over the trip");
  });
  it("says nothing under an hour", () => {
    expect(driveDelta(20.3, 19.6)).toBeNull();
    expect(driveDelta(19.6, 19.6)).toBeNull();
  });
});
