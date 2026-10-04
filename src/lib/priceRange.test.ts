import { describe, it, expect } from "vitest";
import { getPriceRange, currencyForAddress } from "./priceRange";

describe("price ranges in the place's own currency (4 Oct 2026)", () => {
  it("an Italian restaurant with no currency on the card shows euros, not dollars", () => {
    expect(getPriceRange(2, undefined, "Piazza del Mercato Centrale, 50123 Firenze FI, Italy")).toBe("€15–35");
  });
  it("the card's own currency still wins", () => {
    expect(getPriceRange(2, "GBP", "Via X, Lucca, Italy")).toBe("£12–30");
  });
  it("an unknown country falls back to dollars, as before", () => {
    expect(getPriceRange(1, undefined, "Somewhere, Atlantis")).toBe("$5–15");
    expect(currencyForAddress("123 Main St, Toronto, ON, Canada")).toBe("CAD");
    expect(currencyForAddress(null)).toBeNull();
  });
});
