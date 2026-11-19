import { describe, it, expect } from "vitest";
import { airportCode, airportZone, flightLength, lengthLabel } from "./airportZones";

describe("airport clocks (19 Nov 2026)", () => {
  it("reads the code however a card writes it", () => {
    expect(["PSA", "Roma Fiumicino Airport (FCO)", "Toronto Pearson (YYZ)", "Frankfurt FRA", "Pisa International Airport", "", null].map(airportCode))
      .toEqual(["PSA", "FCO", "YYZ", "FRA", null, null, null]);
  });

  it("knows his airports' zones; an unlisted one is null, never a guess", () => {
    expect(["YYZ", "FCO", "PSA", "LAS", "LIR", "SYD", "FRA", "ZZZ"].map(airportZone))
      .toEqual(["America/Toronto", "Europe/Rome", "Europe/Rome", "America/Los_Angeles", "America/Costa_Rica", "Australia/Sydney", "Europe/Berlin", null]);
  });

  it("Rome's AC890: 7:45 PM Toronto → 10:20 AM Rome is 8 h 35 and lands the next day (his ticket says 8hr35)", () => {
    expect(flightLength("YYZ", "FCO", "2026-04-22", 19 * 60 + 45, 10 * 60 + 20)).toEqual({ minutes: 515, landsOn: "2026-04-23" });
  });

  it("the way home, 12:25 PM Rome → 4:00 PM Toronto, is 9 h 35 the same day", () => {
    expect(flightLength("FCO", "YYZ", "2026-04-28", 12 * 60 + 25, 16 * 60)).toEqual({ minutes: 575, landsOn: "2026-04-28" });
  });

  it("Vegas PD653 11:30 → 13:37 is 5 h 07 (Porter's 5hr 7min); New York 9:20 → 10:55 is 1 h 35", () => {
    expect(flightLength("YYZ", "LAS", "2026-11-04", 690, 817)?.minutes).toBe(307);
    expect(flightLength("YYZ", "LGA", "2026-07-23", 560, 655)?.minutes).toBe(95);
  });

  it("across the date line, Sydney to Vancouver lands the 'same' morning it left", () => {
    expect(flightLength("SYD", "YVR", "2026-02-20", 10 * 60, 7 * 60)).toEqual({ minutes: 16 * 60, landsOn: "2026-02-20" });
  });

  it("no length without both zones", () => {
    expect(flightLength("YYZ", "ZZZ", "2026-04-22", 600, 700)).toBeNull();
  });

  it("says the length plainly", () => {
    expect([515, 45, 480, 307].map(lengthLabel)).toEqual(["8 h 35", "45 min", "8 h", "5 h 07"]);
  });
});
