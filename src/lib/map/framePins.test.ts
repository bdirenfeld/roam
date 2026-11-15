import { describe, it, expect } from "vitest";
import { framePins } from "./framePins";
import { kmBetween } from "@/lib/travel/leg";

// Real coordinates from the journeys (15 Nov 2026).
const YYZ   = { lat: 43.6777, lng: -79.6248, isFlight: true,  name: "YYZ" };
const PISA  = { lat: 43.6839, lng: 10.3927,  isFlight: true,  name: "Pisa airport" };
const LUCCA = { lat: 43.8429, lng: 10.5027,  isFlight: false, name: "Villa near Lucca" };
const DAVID = { lat: 43.7768, lng: 11.2589,  isFlight: false, name: "David, Florence" };
const OSAKA = { lat: 34.6937, lng: 135.5023, isFlight: false, name: "Osaka" };
const TOKYO = { lat: 35.6762, lng: 139.6503, isFlight: false, name: "Tokyo" };
const LGA   = { lat: 40.7769, lng: -73.874,  isFlight: true,  name: "LaGuardia" };
const MIDTOWN = { lat: 40.758, lng: -73.9855, isFlight: false, name: "Midtown" };
const PEARSON_PARKING = { lat: 43.6815, lng: -79.6110, isFlight: true, name: "Pearson parking" };

const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("framePins — the map opens on the trip, not the home airport", () => {
  it("Tuscany: leaves YYZ out, keeps Pisa and every stop", () => {
    expect(names(framePins([YYZ, PISA, LUCCA, DAVID]))).toEqual(["Pisa airport", "Villa near Lucca", "David, Florence"]);
  });

  it("New York: leaves the Pearson parking pin out (565 km), keeps LaGuardia", () => {
    expect(names(framePins([PEARSON_PARKING, LGA, MIDTOWN]))).toEqual(["LaGuardia", "Midtown"]);
  });

  it("never leaves out a stop, however far apart the bases are (Osaka ↔ Tokyo)", () => {
    expect(kmBetween(OSAKA, TOKYO)).toBeGreaterThan(300);
    expect(names(framePins([OSAKA, TOKYO]))).toEqual(["Osaka", "Tokyo"]);
  });

  it("a journey with only its flights frames the flights", () => {
    expect(names(framePins([YYZ, PISA]))).toEqual(["YYZ", "Pisa airport"]);
  });

  it("measures distance in km (Pisa airport to the villa is about 20 km)", () => {
    expect(Math.round(kmBetween(PISA, LUCCA))).toBeGreaterThan(15);
    expect(Math.round(kmBetween(PISA, LUCCA))).toBeLessThan(25);
  });
});
