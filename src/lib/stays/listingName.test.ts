import { describe, it, expect } from "vitest";
import { listingName } from "./listingName";

/**
 * Every string here was pulled out of stay_candidates on 11 Sept 2026. None
 * was written by hand, because the last two rounds of hand-written fixtures
 * agreed with the code and missed what his own data showed.
 */
describe("a rental's name is its sales pitch", () => {
  it("cuts the New York banner ad back to a place", () => {
    // The one he was looking at: "those don't make a whole lot of sense".
    expect(listingName("Massive 1,000 sq ft; 3 train lines; Airbnb Superhost; Sealy Hybrid beds"))
      .toBe("Massive 1,000 sq ft");
  });

  it("drops what comes after a dash, a pipe or a semicolon", () => {
    expect(listingName("Beach House with garden - 4 mins walk to water, 2 bed 1 bath"))
      .toBe("Beach House with garden");
    expect(listingName("Cosy 1-Bed near Sydney CBD | Sleeps 4 + Balcony"))
      .toBe("Cosy 1-Bed near Sydney CBD");
    expect(listingName("Bohemian Wishes | Lake View | Pool | Hot Tub"))
      .toBe("Bohemian Wishes");
    expect(listingName("Coogee Beach Escape | Pool & Balcony"))
      .toBe("Coogee Beach Escape");
  });

  it("stops shouting", () => {
    expect(listingName("ELEGANT TROPICAL VILLA RETREAT,ACROSS THE STREET FROM THE BEACH"))
      .toBe("Elegant Tropical Villa Retreat");
    expect(listingName("VILLA GUINIGI EXCLUSIVE RESIDENCE & POOL"))
      .toBe("Villa Guinigi Exclusive Residence & Pool");
  });

  it("leaves a real hotel name exactly as it is", () => {
    for (const n of [
      "The Bowery Hotel", "Artezen Hotel", "Osaka Marriott Miyako Hotel",
      "HOSHINOYA Tokyo", "citizenM New York Bowery", "ModernHaus SoHo",
      "InterContinental Sydney by IHG", "Casa Barbra", "11 Howard",
      "YHA Sydney Harbour", "MONday Apart Premium Ueno", "e-stay namba",
    ]) {
      expect(listingName(n), n).toBe(n);
    }
  });

  it("shortens a name that is still a paragraph, at a word", () => {
    const long = listingName("Palm Springs Luxury: Pool, Hot Tub & Downtown Access For Everyone");
    expect(long.length).toBeLessThanOrEqual(43);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("never returns an empty name", () => {
    for (const n of ["Sleeps 6", "| | |", "   ", "-"]) {
      expect(typeof listingName(n)).toBe("string");
    }
    expect(listingName("Sleeps 6")).toBe("Sleeps 6");
  });
});
