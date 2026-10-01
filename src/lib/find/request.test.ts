import { describe, it, expect } from "vitest";
import { findRequest, warmPlan } from "./request";
import type { FindBase } from "./gaps";

const lucca = { label: "Lucca", lat: 43.83, lng: 10.45, sights: [{ title: "Guinigi Tower", lat: 43.843, lng: 10.507 }] } as unknown as FindBase;
const pisa = { ...lucca, label: "Pisa" } as FindBase;
const florence = { ...lucca, label: "Florence" } as FindBase;

describe("one Find request for the sheet and the warm-up alike", () => {
  it("coffee carries the sights it should be near; a beach does not", () => {
    expect(findRequest("t", lucca, "coffee", "travellers")).toMatchObject({ tripId: "t", subType: "coffee", mode: "travellers", ask: null, nearNames: ["Guinigi Tower"] });
    expect(findRequest("t", lucca, "beach", "google")).not.toHaveProperty("near");
  });
  it("warms every category, both halves, for the first two bases, and nothing for a trip that is over", () => {
    const jobs = warmPlan([lucca, pisa, florence], ["beach", "coffee"], "2027-09-04", "2026-09-30");
    expect(jobs).toHaveLength(8);
    expect(new Set(jobs.map((j) => j.base.label))).toEqual(new Set(["Lucca", "Pisa"]));
    expect(warmPlan([lucca], ["beach"], "2026-03-12", "2026-09-30")).toEqual([]);
  });
});
