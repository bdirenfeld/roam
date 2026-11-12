import { describe, it, expect } from "vitest";
import { estimateKey, readEstimate, changesLabel, viaOf, planMinutes, endAfter, estimateLabel } from "./estimate";

// Villa Zambaldi → My Tuscan Kitchen, as the Tuscany board holds them (12 Nov 2026).
const VILLA = { lat: 43.8687123, lng: 10.4497891 };
const MTK = { lat: 43.5651, lng: 10.7005 };

describe("readEstimate", () => {
  it("returns the saved answer only for the same From/To", () => {
    const details = { estimate: { key: estimateKey(VILLA, MTK), drive: 57, transit: 140, rides: 2, via: "train" } };
    expect(readEstimate(details, VILLA, MTK)).toEqual({ key: estimateKey(VILLA, MTK), drive: 57, transit: 140, rides: 2, via: "train" });
    expect(readEstimate(details, MTK, VILLA)).toBeNull();
    expect(readEstimate(details, VILLA, null)).toBeNull();
    expect(readEstimate({}, VILLA, MTK)).toBeNull();
  });
  it("a missing mode reads as null, not zero", () => {
    expect(readEstimate({ estimate: { key: estimateKey(VILLA, MTK), drive: 57, transit: null } }, VILLA, MTK)?.transit).toBeNull();
  });
});

describe("planMinutes / endAfter / estimateLabel", () => {
  it("rounds to five minutes", () => {
    expect(planMinutes(57)).toBe(55);
    expect(planMinutes(58)).toBe(60);
    expect(planMinutes(2)).toBe(5);
  });
  it("adds minutes to a start time and wraps midnight", () => {
    expect(endAfter("09:40:00", 55)).toBe("10:35");
    expect(endAfter("23:30", 45)).toBe("00:15");
  });
  it("labels like the board", () => {
    expect(estimateLabel(55)).toBe("55 min");
    expect(estimateLabel(60)).toBe("1 h");
    expect(estimateLabel(100)).toBe("1 h 40");
  });
});

describe("changesLabel", () => {
  it("counts changes, not rides", () => {
    expect(changesLabel(1)).toBe("");
    expect(changesLabel(2)).toBe("1 change");
    expect(changesLabel(3)).toBe("2 changes");
    expect(changesLabel(null)).toBe("");
  });
});

describe("viaOf", () => {
  it("rail wins, then ferry, else bus; nothing is null", () => {
    expect(viaOf(["BUS", "HEAVY_RAIL"])).toBe("train");
    expect(viaOf(["FERRY"])).toBe("ferry");
    expect(viaOf(["BUS"])).toBe("bus");
    expect(viaOf([])).toBeNull();
  });
});
