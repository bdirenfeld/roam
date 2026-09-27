import { describe, it, expect } from "vitest";
import { matchRegions } from "./regions";

describe("matchRegions", () => {
  it("offers Europe for 'Europe', not a hamlet in Brescia", () => {
    expect(matchRegions("Europe").map((r) => r.name)).toEqual(["Europe"]);
    expect(matchRegions("eur")[0].name).toBe("Europe");
  });
  it("reads 'the' and aliases either way", () => {
    expect(matchRegions("Caribbean")[0].name).toBe("The Caribbean");
    expect(matchRegions("the balk")[0].name).toBe("The Balkans");
    expect(matchRegions("nordic")[0].name).toBe("Scandinavia");
  });
  it("stays quiet for a city or one letter", () => {
    expect(matchRegions("Rome")).toEqual([]);
    expect(matchRegions("e")).toEqual([]);
  });
});
