import { describe, it, expect } from "vitest";
import { isCategorySearch } from "./searchIntent";

describe("isCategorySearch", () => {
  it("reads 'what's here' searches", () => {
    expect(isCategorySearch("summer day camp kids Barcelona")).toBe(true);
    expect(isCategorySearch("playground near Sagrada Familia")).toBe(true);
    expect(isCategorySearch("pizza")).toBe(true);
    expect(isCategorySearch("gelato in Lucca")).toBe(true);
  });
  it("leaves a name to autocomplete", () => {
    expect(isCategorySearch("Tootsies Orchid Lounge")).toBe(false);
    expect(isCategorySearch("Colosseum")).toBe(false);
    expect(isCategorySearch("Ryman Auditorium")).toBe(false);
    expect(isCategorySearch("Sagrada Familia")).toBe(false);
  });
});
