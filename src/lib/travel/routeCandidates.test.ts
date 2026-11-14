import { describe, it, expect } from "vitest";
import { routeCandidates, townOf, type RouteCard } from "./routeCandidates";

// Brennan's real Tuscany trip around Thu 26 Aug 2027.
const VILLA = { title: "Villa Zambaldi", lat: 43.8298808, lng: 10.4497198, address: "Via Fonda, 403, 55100 Lucca LU, Italy", place_id: "p-villa" };
const place = (id: string, title: string, lat: number, lng: number, address: string, sub_type = "restaurant") => ({ id, title, lat, lng, address, sub_type, type: "food" });
const CARDS: RouteCard[] = [
  { id: "drive", day_id: "d26", status: "in_itinerary", start_time: "08:45:00", details: { from: VILLA, mode: "drive", named: true, title: "Villa Zambaldi → Lucca (station car park)" }, place: { ...place("p-car", "Lucca", 43.8374, 10.5061, "Viale Camillo Benso Cavour, 15, 55100 Lucca LU, Italy", "transit"), type: "logistics" } },
  { id: "walk", day_id: "d26", status: "in_itinerary", start_time: "09:15:00", details: { title: "Lucca Wandering" }, place: place("p-sm", "San Michele in Foro", 43.8430, 10.5050, "P.za San Michele, 55100 Lucca LU, Italy", "self_directed") },
  { id: "lunch", day_id: "d26", status: "in_itinerary", start_time: "12:30:00", place: place("p-forno", "Forno a Vapore Amedeo Giusti", 43.8441, 10.5037, "Via Santa Lucia, 20, 55100 Lucca LU, Italy") },
  { id: "old", day_id: "d26", status: "in_itinerary", start_time: "09:00:00", archived: true, place: place("p-pin", "Pinelli Bakery", 43.8425, 10.5040, "Lucca, Italy") },
  { id: "pisa", day_id: "d24", status: "in_itinerary", start_time: "11:00:00", place: place("p-psa", "Pisa International Airport", 43.6839, 10.3927, "Piazzale D'Ascanio, 1, 56121 Pisa PI, Italy", "flight_arrival") },
  { id: "giulio", day_id: null, status: "interested", start_time: null, place: place("p-giu", "Trattoria da Giulio", 43.8456, 10.4979, "Via delle Conce, 45, 55100 Lucca LU, Italy") },
  { id: "ciacco", day_id: null, status: "interested", start_time: null, place: place("p-cia", "Ciacco", 43.8420, 10.5010, "Via Fillungo, 1, 55100 Lucca LU, Italy") },
  { id: "far", day_id: null, status: "interested", start_time: null, place: place("p-far", "Osteria in Montepulciano", 43.0925, 11.7808, "Via di Gracciano, 53045 Montepulciano SI, Italy") },
  { id: "felice", day_id: null, status: "interested", start_time: null, place: place("p-fel", "Pizzeria da Felice", 43.8435, 10.5025, "Via Buia, 12, 55100 Lucca LU, Italy") },
];
const LUCCA = { lat: 43.843, lng: 10.505 };

describe("routeCandidates — your places before Google (14 Nov 2026)", () => {
  it("To, from the villa: today's stops then the car park used; the villa is not offered back; no archived stops", () => {
    const { yours } = routeCandidates({ cards: CARDS, dayId: "d26", stay: VILLA, exclude: VILLA, near: LUCCA });
    expect(yours.map((c) => c.title)).toEqual(["Lucca Wandering", "Forno a Vapore Amedeo Giusti", "Lucca (station car park)"]);
    expect(yours[0].sub).toBe("Today · 9:15 AM · Lucca");
    expect(yours[2].sub).toBe("Used on this trip · Lucca");
  });

  it("From, with To set: last night's stay leads, and what is already the To is left out", () => {
    const to = { title: "Forno a Vapore Amedeo Giusti", lat: 43.8441, lng: 10.5037 };
    const { yours } = routeCandidates({ cards: CARDS, dayId: "d26", stay: VILLA, exclude: to, near: LUCCA });
    expect(yours.map((c) => c.title)).toEqual(["Villa Zambaldi", "Lucca Wandering", "Lucca (station car park)"]);
    expect(yours[0].sub).toBe("Last night’s stay");
  });

  it("at most four of yours and the three nearest saved pins (Montepulciano last, so cut)", () => {
    const { yours, saved } = routeCandidates({ cards: CARDS, dayId: "d26", stay: VILLA, exclude: null, near: LUCCA });
    expect(yours).toHaveLength(4);
    expect(saved.map((c) => c.title)).toEqual(["Pizzeria da Felice", "Ciacco", "Trattoria da Giulio"]);
    expect(saved[0].sub).toBe("Saved on your map · Lucca");
  });

  it("typing narrows by name across the whole trip: 'pis' finds the airport on another day", () => {
    const { yours, saved } = routeCandidates({ cards: CARDS, dayId: "d26", stay: VILLA, exclude: VILLA, near: LUCCA, query: "pis" });
    expect(yours.map((c) => [c.title, c.sub])).toEqual([["Pisa International Airport", "In your trip · Pisa"]]);
    expect(saved).toEqual([]);
  });

  it("each place carries what the card needs: its point, address and place id", () => {
    const { yours } = routeCandidates({ cards: CARDS, dayId: "d26", stay: null, exclude: null, near: null });
    expect(yours[0]).toMatchObject({ lat: 43.843, lng: 10.505, place_id: "p-sm", address: "P.za San Michele, 55100 Lucca LU, Italy" });
  });
});

describe("townOf", () => {
  it("reads the town beside the postcode, else the part before the country", () => {
    expect(townOf("Via Santa Lucia, 20, 55100 Lucca LU, Italy")).toBe("Lucca");
    expect(townOf("Piazzale D'Ascanio, 1, 56121 Pisa PI, Italy")).toBe("Pisa");
    expect(townOf("viale 55100, Viale Camillo Benso Cavour, 15, 55100 Lucca LU, Italy")).toBe("Lucca");
    expect(townOf("Rome, Metropolitan City of Rome Capital, Italy")).toBe("Metropolitan City of Rome Capital");
    expect(townOf(null)).toBeNull();
  });
});

describe("routeCandidates — live test on his Thu 26 Aug (14 Nov 2026)", () => {
  const near = { lat: 43.8374, lng: 10.5061 };
  const live: RouteCard[] = [
    { id: "walk", day_id: "d26", status: "in_itinerary", start_time: "09:15:00", details: { title: "Lucca Wandering" }, place: { id: "p-sm", title: "San Michele in Foro", lat: 43.8432, lng: 10.5034, address: "P.za San Michele, 55100 Lucca LU, Italy", sub_type: "self_directed" } },
    // 30-odd metres from San Michele: a different place, not a duplicate.
    { id: "lunch", day_id: "d26", status: "in_itinerary", start_time: "12:30:00", place: { id: "p-forno", title: "Forno a Vapore Amedeo Giusti", lat: 43.8435394, lng: 10.5031778, address: "Via Santa Lucia, 20, 55100 Lucca LU, Italy", sub_type: "restaurant" } },
    // A station used on the Cinque Terre day, 70 km away: not for a Lucca drive.
    { id: "vern", day_id: "d30", status: "in_itinerary", start_time: "09:15:00", details: { from: { title: "Levanto", lat: 44.17, lng: 9.61 }, mode: "train" }, place: { id: "p-vern", title: "Vernazza", lat: 44.134968, lng: 9.684806, address: "19018 Vernazza SP, Italy", sub_type: "transit", type: "logistics" } },
  ];

  it("the bakery 30 m from San Michele is still offered", () => {
    const { yours } = routeCandidates({ cards: live, dayId: "d26", stay: null, exclude: null, near });
    expect(yours.map((c) => c.title)).toEqual(["Lucca Wandering", "Forno a Vapore Amedeo Giusti"]);
  });

  it("a station used far from here (Vernazza) is not offered", () => {
    const { yours } = routeCandidates({ cards: live, dayId: "d26", stay: null, exclude: null, near });
    expect(yours.map((c) => c.title)).not.toContain("Vernazza");
  });
});
