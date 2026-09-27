import { describe, it, expect } from "vitest";
import { currencyForDestination } from "./currency";

describe("currencyForDestination", () => {
  it("reads the country at the end of the destination", () => {
    expect(currencyForDestination("Barcelona, Spain")).toBe("EUR");
    expect(currencyForDestination("Tokyo, Japan")).toBe("JPY");
    expect(currencyForDestination("Toronto & the GTA")).toBe("CAD");
  });
  it("a one-currency region has its currency; a mixed one is left unset", () => {
    expect(currencyForDestination("Europe")).toBe("EUR");
    expect(currencyForDestination("Scandinavia")).toBeNull();
    expect(currencyForDestination("The British Isles")).toBeNull();
  });
});
