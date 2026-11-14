import { describe, it, expect } from "vitest";
import { readPark, parkSpots, parkMinutes, inItaly, isParkOrStation, PARK_CHOICES } from "./park";

// Lucca: San Michele in the old town, the station car park outside the walls.
const SAN_MICHELE = { lat: 43.8430, lng: 10.5050 };
type Row = Partial<{ name: string; lat: number; lng: number; vicinity: string; place_id: string; business_status: string; types: string[]; reviews: number }>;
const nearby = (rows: Row[]) => ({
  results: rows.map((r) => ({ name: r.name, geometry: { location: { lat: r.lat, lng: r.lng } }, vicinity: r.vicinity, place_id: r.place_id, business_status: r.business_status, types: r.types ?? ["parking", "point_of_interest"], user_ratings_total: r.reviews })),
});

// Google's real answer around San Michele, 14 Nov 2026 (trimmed). The nearest
// "parking" are residents-only bays and a bike shop inside the walls.
const LUCCA: Row[] = [
  { name: "Hotel Stipino", lat: 43.8394, lng: 10.5182, types: ["spa", "parking", "lodging"], reviews: 166 },
  { name: "Pro Classic Cycle", lat: 43.8449, lng: 10.5021, types: ["bicycle_store", "parking"], reviews: 117 },
  { name: "Parcheggio Cittadella", lat: 43.8378, lng: 10.5017, reviews: 333, place_id: "cit" },
  { name: "Mazzini Parking lot", lat: 43.8399, lng: 10.4964, reviews: 939, place_id: "maz", vicinity: "Via dei Bacchettoni, Lucca" },
  { name: "Parcheggio Palatucci", lat: 43.8509, lng: 10.5009, reviews: 1148, place_id: "pal" },
  { name: "Parcheggio", lat: 43.8441, lng: 10.5059, reviews: 3, vicinity: "Piazza dei Servi, 11, Lucca" },
  { name: "Ride the Walls", lat: 43.8411, lng: 10.5021, reviews: 71 },
  { name: "Parcheggio riservato", lat: 43.8462, lng: 10.5054, reviews: 6 },
  { name: "Parcheggio Moto (Porta San Pietro)", lat: 43.8394, lng: 10.5047, reviews: 0 },
];

describe("parkSpots — car parks near where you're going (14 Nov 2026)", () => {
  it("Lucca: the big public car parks by reviews, not the residents' bays or the bike shop nearest San Michele", () => {
    const spots = parkSpots(nearby(LUCCA), SAN_MICHELE);
    expect(spots.map((s) => s.title)).toEqual(["Parcheggio Palatucci", "Mazzini Parking lot", "Parcheggio Cittadella"]);
    expect(spots).toHaveLength(PARK_CHOICES);
    expect(spots[1]).toMatchObject({ address: "Via dei Bacchettoni, Lucca", google_place_id: "maz" });
  });

  it("drops a place whose main kind isn't parking, motorbike and reserved bays, and one closed for good", () => {
    const titles = parkSpots(nearby([
      ...LUCCA.slice(5),
      { name: "Shut", lat: 43.8425, lng: 10.5045, business_status: "CLOSED_PERMANENTLY", reviews: 500 },
    ]), SAN_MICHELE).map((s) => s.title);
    expect(titles).toEqual(["Ride the Walls", "Parcheggio"]);
  });

  it("drops a car park past 1.2 km and rows with no name or point", () => {
    expect(parkSpots(nearby([{ name: "Far", lat: 43.86, lng: 10.52, reviews: 900 }, { name: "", lat: 43.84, lng: 10.5 }]), SAN_MICHELE)).toEqual([]);
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
