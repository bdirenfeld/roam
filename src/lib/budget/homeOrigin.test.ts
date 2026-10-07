import { describe, it, expect } from "vitest";
import { airportOrigin, homeOriginFor, loadHomeProfile, TORONTO } from "./homeOrigin";
import { HOME, greatCircleKm } from "./model";

// The Budget measured every journey from Toronto (7 Oct 2026): a Londoner's
// Paris weekend came out long-haul. The origin is the person's own now.
describe("homeOriginFor: home airport, then home country, then passport, then Toronto", () => {
  it("reads an airport however it was typed", () => {
    expect(airportOrigin("LHR")!.label).toBe("London");
    expect(airportOrigin("lhr")!.label).toBe("London");
    expect(airportOrigin("Toronto Pearson (YYZ)")!.label).toBe("Toronto");
    expect(airportOrigin("JFK - New York")!.label).toBe("New York");
    expect(airportOrigin("Vancouver")!.label).toBe("Vancouver");
    expect(airportOrigin("")).toBeNull();
    expect(airportOrigin("XQZ")).toBeNull();
  });

  it("falls back to the home country's hub, then the passport's", () => {
    expect(homeOriginFor(null, "United Kingdom").label).toBe("London");
    expect(homeOriginFor("", "USA").label).toBe("New York");
    expect(homeOriginFor(null, null, "Australian").label).toBe("Sydney");
    expect(homeOriginFor("SFO", "USA").label).toBe("San Francisco");
  });

  it("a blank Profile, or a Torontonian, is measured from exactly where it always was", () => {
    for (const o of [homeOriginFor(null), homeOriginFor("", null, null), homeOriginFor(null, "Canada"), homeOriginFor("YYZ", "Canada")]) {
      expect(o.label).toBe("Toronto");
      expect([o.lat, o.lng]).toEqual([HOME.lat, HOME.lng]);
    }
  });

  it("Paris is short-haul from London, long-haul from Toronto", () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const london = homeOriginFor("LHR");
    expect(greatCircleKm(london.lat, london.lng, paris.lat, paris.lng)).toBeLessThan(800);
    expect(greatCircleKm(TORONTO.lat, TORONTO.lng, paris.lat, paris.lng)).toBeGreaterThan(6000);
  });
});

describe("loadHomeProfile", () => {
  const client = (row: Record<string, unknown> | null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  });
  it("reads currency and origin from one row", async () => {
    const p = await loadHomeProfile(client({ home_airport: "MAN", home_country: "United Kingdom", passport_country: null }), "u1");
    expect(p.currency).toBe("GBP");
    expect(p.origin.label).toBe("Manchester");
  });
  it("no id, no row, or an error: CAD from Toronto", async () => {
    expect(await loadHomeProfile(client(null), null)).toEqual({ currency: "CAD", origin: TORONTO });
    expect(await loadHomeProfile(client(null), "u1")).toEqual({ currency: "CAD", origin: TORONTO });
    expect(await loadHomeProfile({ from: () => { throw new Error("down"); } }, "u1")).toEqual({ currency: "CAD", origin: TORONTO });
  });
});
