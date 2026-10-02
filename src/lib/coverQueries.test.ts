import { describe, it, expect } from "vitest";
import { coverQueries } from "./coverQueries";

describe("cover photo searches", () => {
  it("a ward-level name falls back to the city, then the country (his Vietnam journey)", () => {
    expect(coverQueries("Viet Hung, Ha Noi, Vietnam")).toEqual([
      "Viet Hung, Ha Noi, Vietnam travel landmark",
      "Ha Noi, Vietnam travel landmark",
      "Vietnam travel landmark",
    ]);
  });
  it("one word is one search; blanks and stray commas are ignored", () => {
    expect(coverQueries("Tuscany")).toEqual(["Tuscany travel landmark"]);
    expect(coverQueries(" Lisbon , , Portugal ")).toEqual(["Lisbon, Portugal travel landmark", "Portugal travel landmark"]);
    expect(coverQueries("")).toEqual([]);
  });
});
