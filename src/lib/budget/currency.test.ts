import { describe, it, expect } from "vitest";
import { currencyForDestination, homeCountryName, homeCurrencyFor, homeSymbol, loadHomeCurrency, referenceRateToHome, unitName } from "./currency";

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

// A person's own currency (6 Oct 2026, Brennan: "based on the passport and the
// person's home country … that's the currency they get the pricing in").
describe("homeCurrencyFor: home country, then passport, then CAD", () => {
  it("reads the common homes", () => {
    expect(homeCurrencyFor("Canada")).toBe("CAD");
    expect(homeCurrencyFor("United States")).toBe("USD");
    expect(homeCurrencyFor("USA")).toBe("USD");
    expect(homeCurrencyFor("United Kingdom")).toBe("GBP");
    expect(homeCurrencyFor("England")).toBe("GBP");
    expect(homeCurrencyFor("Australia")).toBe("AUD");
    expect(homeCurrencyFor("New Zealand")).toBe("NZD");
    expect(homeCurrencyFor("Germany")).toBe("EUR");
    expect(homeCurrencyFor("Ireland")).toBe("EUR");
    expect(homeCurrencyFor("India")).toBe("INR");
    expect(homeCurrencyFor("Japan")).toBe("JPY");
  });
  it("takes a passport typed as a demonym, a code, or a city with its country", () => {
    expect(homeCurrencyFor("American")).toBe("USD");
    expect(homeCurrencyFor("British")).toBe("GBP");
    expect(homeCurrencyFor("Canadian")).toBe("CAD");
    expect(homeCurrencyFor("us")).toBe("USD");
    expect(homeCurrencyFor("London, United Kingdom")).toBe("GBP");
    expect(homeCurrencyFor("  united states  ")).toBe("USD");
  });
  it("home country wins over the passport; a blank or unknown home falls to the passport", () => {
    expect(homeCurrencyFor("United Kingdom", "Canadian")).toBe("GBP");
    expect(homeCurrencyFor(null, "American")).toBe("USD");
    expect(homeCurrencyFor("", "Australia")).toBe("AUD");
    expect(homeCurrencyFor("Narnia", "British")).toBe("GBP");
  });
  it("nothing known is CAD, as before", () => {
    expect(homeCurrencyFor()).toBe("CAD");
    expect(homeCurrencyFor(null, null)).toBe("CAD");
    expect(homeCurrencyFor("Narnia")).toBe("CAD");
  });
  it("homeCountryName gives one name per country", () => {
    expect(homeCountryName("Holland")).toBe("netherlands");
    expect(homeCountryName("Great Britain")).toBe("united kingdom");
    expect(homeCountryName(undefined)).toBeNull();
  });
});

describe("loadHomeCurrency: the signed-in person's row", () => {
  const client = (row: Record<string, unknown> | null) => {
    const asked: string[] = [];
    const q: Record<string, unknown> = {};
    q.select = (cols: string) => { asked.push(cols); return q; };
    q.eq = () => q;
    q.maybeSingle = () => Promise.resolve({ data: row });
    return { asked, from: () => q };
  };
  it("a US person's money is in USD", async () => {
    expect(await loadHomeCurrency(client({ home_country: "United States", passport_country: null }), "u1")).toBe("USD");
  });
  it("no home country: the passport", async () => {
    expect(await loadHomeCurrency(client({ home_country: null, passport_country: "British" }), "u1")).toBe("GBP");
  });
  it("no one signed in, no row, or a failure: CAD", async () => {
    expect(await loadHomeCurrency(client({ home_country: "United States" }), null)).toBe("CAD");
    expect(await loadHomeCurrency(client(null), "u1")).toBe("CAD");
    expect(await loadHomeCurrency({ from: () => { throw new Error("down"); } }, "u1")).toBe("CAD");
  });
});

describe("rates and signs for a home that is not Canada", () => {
  it("the reference table divides through CAD for another home", () => {
    expect(referenceRateToHome("EUR")).toBe(1.603);
    expect(referenceRateToHome("EUR", "CAD")).toBe(1.603);
    expect(referenceRateToHome("USD", "USD")).toBe(1);
    expect(referenceRateToHome("EUR", "USD")).toBeCloseTo(1.603 / 1.379, 6);
    expect(referenceRateToHome("CAD", "USD")).toBeCloseTo(1 / 1.379, 6);
    expect(referenceRateToHome("XXX", "USD")).toBeNull();
  });
  it("a dollar home writes $; others their own sign; the rate word follows", () => {
    expect(homeSymbol("CAD")).toBe("$");
    expect(homeSymbol("USD")).toBe("$");
    expect(homeSymbol("GBP")).toBe("£");
    expect(homeSymbol("EUR")).toBe("€");
    expect(unitName("USD")).toBe("dollars");
    expect(unitName("GBP")).toBe("pounds");
    expect(unitName("EUR")).toBe("euros");
  });
});
