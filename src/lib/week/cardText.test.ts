import { describe, it, expect } from "vitest";
import { shortAddress, firstSentence } from "./cardText";

// Real addresses and notes from the Tuscany journey (live places, 26 Sep 2026).
describe("shortAddress", () => {
  it("keeps the street and number, drops postal code, city and country", () => {
    expect(shortAddress("Via Rosina, 2r, 50123 Firenze FI, Italy")).toBe("Via Rosina, 2r");
    expect(shortAddress("Via Ricasoli, 58/60, 50129 Firenze FI, Italy")).toBe("Via Ricasoli, 58/60");
    expect(shortAddress("Piazza del Duomo, 50122 Firenze FI, Italy")).toBe("Piazza del Duomo");
    expect(shortAddress("Piazza del Mercato Centrale, 50123 Firenze FI, Italy")).toBe("Piazza del Mercato Centrale");
  });
  it("does not glue a town onto a street without a number", () => {
    expect(shortAddress("Via Fonda, Lucca, Italy")).toBe("Via Fonda");
  });
  it("handles empty input", () => {
    expect(shortAddress(null)).toBe("");
    expect(shortAddress("")).toBe("");
  });
});

describe("firstSentence", () => {
  it("takes the first sentence of the first line", () => {
    expect(firstSentence("Florence, since 1953. Google 4.6 (4,600). Lunch only.")).toBe("Florence, since 1953.");
    expect(firstSentence("Nothing booked\nmore")).toBe("Nothing booked");
    expect(firstSentence(null)).toBe("");
  });
});
