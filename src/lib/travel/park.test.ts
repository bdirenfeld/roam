import { describe, it, expect } from "vitest";
import { readPark, parkSpots, parkMinutes, inItaly, isParkOrStation, PARK_CHOICES } from "./park";

// Lucca: San Michele in the old town, the station car park outside the walls.
const SAN_MICHELE = { lat: 43.8430, lng: 10.5050 };
const nearby = (rows: Array<Partial<{ name: string; lat: number; lng: number; vicinity: string; place_id: string; business_status: string }>>) => ({
  results: rows.map((r) => ({ name: r.name, geometry: { location: { lat: r.lat, lng: r.lng } }, vicinity: r.vicinity, place_id: r.place_id, business_status: r.business_status })),
});

describe("parkSpots — car parks near where you're going (14 Nov 2026)", () => {
  it("keeps Google's nearest-first order, within 1.2 km, at most three", () => {
    const spots = parkSpots(nearby([
      { name: "Parcheggio Mazzini", lat: 43.8395, lng: 10.4985, vicinity: "Via Mazzini", place_id: "a" },
      { name: "Lucca station car park", lat: 43.8374125, lng: 10.5061477, vicinity: "Viale Cavour", place_id: "b" },
      { name: "Parcheggio Carducci", lat: 43.8402, lng: 10.4949, place_id: "c" },
      { name: "Parcheggio Palatucci", lat: 43.8470, lng: 10.4960, place_id: "d" },
    ]), SAN_MICHELE);
    expect(spots.map((s) => s.title)).toEqual(["Parcheggio Mazzini", "Lucca station car park", "Parcheggio Carducci"]);
    expect(spots).toHaveLength(PARK_CHOICES);
    expect(spots[1]).toMatchObject({ address: "Viale Cavour", google_place_id: "b" });
  });

  it("drops a car park past 1.2 km, one closed for good, and rows with no name or point", () => {
    const spots = parkSpots(nearby([
      { name: "Far away", lat: 43.86, lng: 10.52 },
      { name: "Shut", lat: 43.8425, lng: 10.5045, business_status: "CLOSED_PERMANENTLY" },
      { name: "", lat: 43.8425, lng: 10.5045 },
      { name: "Parcheggio Mazzini", lat: 43.8395, lng: 10.4985 },
    ]), SAN_MICHELE);
    expect(spots.map((s) => s.title)).toEqual(["Parcheggio Mazzini"]);
  });

  it("an empty or broken answer is no car parks, not a crash", () => {
    expect(parkSpots(null, SAN_MICHELE)).toEqual([]);
    expect(parkSpots({ status: "ZERO_RESULTS" }, SAN_MICHELE)).toEqual([]);
  });
});

describe("readPark — the car park saved on a travel card", () => {
  it("reads a car park with both times", () => {
    expect(readPark({ park: { title: "Lucca station car park", lat: 43.8374, lng: 10.5061, drive: 10.2, walk: 15 } }))
      .toEqual({ title: "Lucca station car park", lat: 43.8374, lng: 10.5061, drive: 10, walk: 15 });
  });
  it("is null without a title, a point or a time", () => {
    expect(readPark({ park: { title: "", lat: 1, lng: 1, drive: 1, walk: 1 } })).toBeNull();
    expect(readPark({ park: { title: "X", lat: 1, lng: 1, walk: 1 } })).toBeNull();
    expect(readPark({})).toBeNull();
    expect(readPark(null)).toBeNull();
  });
});

describe("the small rules", () => {
  it("door to door is the drive plus the walk", () => expect(parkMinutes({ drive: 10, walk: 15 })).toBe(25));
  it("Italy by its address, in either language", () => {
    expect(inItaly("P.za San Michele, 55100 Lucca LU, Italy")).toBe(true);
    expect(inItaly("Piazza del Duomo, Firenze, Italia")).toBe(true);
    expect(inItaly("Rue de Rivoli, Paris, France")).toBe(false);
    expect(inItaly(null)).toBe(false);
  });
  it("a car park or station as the destination gets no park-and-walk", () => {
    expect(isParkOrStation("Lucca station car park")).toBe(true);
    expect(isParkOrStation("Parcheggio Carducci")).toBe(true);
    expect(isParkOrStation("San Michele in Foro")).toBe(false);
  });
});
