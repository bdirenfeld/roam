import { describe, it, expect } from "vitest";
import { inferType, inferTypeOrSight } from "./inferType";

// Google `types` exactly as returned for real places (26 Sep 2026 test journeys).
describe("inferType", () => {
  it("reads the specific categories", () => {
    expect(inferType(["restaurant", "food", "point_of_interest", "establishment"])).toEqual({ type: "food", sub_type: "restaurant" });
    expect(inferType(["lodging", "point_of_interest", "establishment"])).toEqual({ type: "logistics", sub_type: "hotel" });
    expect(inferType(["airport", "point_of_interest", "establishment"])).toEqual({ type: "logistics", sub_type: "flight_arrival" });
    expect(inferType(["amusement_park", "establishment", "museum"])).toEqual({ type: "activity", sub_type: "guided" }); // teamLab: museum is ranked first
  });
  it("keeps a gelateria as food, not a shop", () => {
    expect(inferType(["food", "point_of_interest", "store", "establishment"])).toEqual({ type: "food", sub_type: "restaurant" });
  });
  it("finds nothing for streets, neighbourhoods and bare points of interest", () => {
    expect(inferType(["establishment", "point_of_interest"]).type).toBeNull();   // Tsukiji Outer Market
    expect(inferType(["geocode", "route"]).type).toBeNull();                      // Takeshita Street
    expect(inferType(["geocode", "political", "sublocality"]).type).toBeNull();   // Dotonbori
    expect(inferType(null).type).toBeNull();
  });
});

describe("inferTypeOrSight", () => {
  it("falls back to a sight you wander instead of nothing", () => {
    expect(inferTypeOrSight(["establishment", "point_of_interest"])).toEqual({ type: "activity", sub_type: "self_directed" });
    expect(inferTypeOrSight(["colloquial_area", "geocode", "political"])).toEqual({ type: "activity", sub_type: "self_directed" });
    expect(inferTypeOrSight(undefined)).toEqual({ type: "activity", sub_type: "self_directed" });
  });
  it("keeps a real category when there is one", () => {
    expect(inferTypeOrSight(["cafe", "food"])).toEqual({ type: "food", sub_type: "coffee" });
  });
});
