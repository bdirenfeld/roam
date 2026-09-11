import { describe, it, expect } from "vitest";
import { inventoriesFor, MAX_HOTEL_GUESTS } from "./inventory";

describe("inventoriesFor", () => {
  it("asks both inventories for a party a hotel can take", () => {
    expect(inventoriesFor(5, true)).toEqual({ rentals: true, hotels: true, prefer: "rentals" });
    expect(inventoriesFor(2, false)).toEqual({ rentals: true, hotels: true, prefer: "hotels" });
  });

  it("stops asking for hotels above Google's cap", () => {
    // Tuscany is seven: two parents, three children and both grandparents.
    // The hotel call returns "Total number of travelers should be less than or
    // equal to 6" and nothing else (probed 11 Sept 2026).
    expect(inventoriesFor(7, true).hotels).toBe(false);
    expect(inventoriesFor(MAX_HOTEL_GUESTS, true).hotels).toBe(true);
    expect(inventoriesFor(MAX_HOTEL_GUESTS + 1, true).hotels).toBe(false);
  });

  it("never leaves a big party with nothing to search", () => {
    // The dangerous case: a hotel-shaped journey with seven people. Without
    // this the ONLY search that ran was the one Google refuses.
    const big = inventoriesFor(7, false);
    expect(big.hotels).toBe(false);
    expect(big.rentals).toBe(true);
    expect(big.prefer).toBe("rentals");
  });

  it("always searches rentals, whatever the party", () => {
    for (const n of [1, 2, 6, 7, 12]) expect(inventoriesFor(n, true).rentals).toBe(true);
  });
});
