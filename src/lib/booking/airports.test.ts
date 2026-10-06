import { describe, it, expect } from "vitest";
import { airportsKey, airportsPrompt, parseAirports } from "./airports";

describe("parseAirports", () => {
  it("reads the JSON Claude was asked for", () => {
    expect(parseAirports('{"airports":["PSA","FLR"]}')).toEqual(["PSA", "FLR"]);
  });
  it("reads it inside prose or a code fence, and a bare array", () => {
    expect(parseAirports('Sure:\n```json\n{"airports": ["NRT", "HND"]}\n```')).toEqual(["NRT", "HND"]);
    expect(parseAirports('["SYD"]')).toEqual(["SYD"]);
  });
  it("keeps only exactly three capital letters, no repeats, at most three", () => {
    expect(parseAirports('{"airports":["psa","Pisa","FLRX","BLQ","BLQ","FLR","PSA","GOA"]}')).toEqual(["BLQ", "FLR", "PSA"]);
  });
  it("returns nothing for an answer it cannot read", () => {
    expect(parseAirports("Pisa and Florence")).toEqual([]);
    expect(parseAirports("{not json}")).toEqual([]);
  });
});

describe("airportsKey / airportsPrompt", () => {
  it("one cache key per destination, whatever its case", () => {
    expect(airportsKey(" Tuscany, Italy ")).toBe("airports|tuscany, italy");
    expect(airportsKey("TUSCANY, ITALY")).toBe(airportsKey("Tuscany, Italy"));
  });
  it("names the place and its point, and asks for codes only", () => {
    const p = airportsPrompt("Tuscany, Italy", 43.5671153, 10.9807003);
    expect(p).toContain("Tuscany, Italy (43.5671, 10.9807)");
    expect(p).toContain("IATA codes only");
    expect(airportsPrompt("Tokyo, Japan", null, null)).toContain("going to Tokyo, Japan:");
  });
});
