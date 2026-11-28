import { describe, it, expect } from "vitest";
import { driveWay, transitWay, mixWay, offerWays, waysLabel, readLegs, clockAt, runLegs, currentWay, vehicleMode, transitLegs } from "./ways";
import { routeFrom } from "@/lib/plan/gettingThere";

// His Florence day, 28 Aug 2027: Villa Zambaldi (outside Lucca) to Firenze S.M.N.
const villa = { title: "Villa Zambaldi", lat: 43.87, lng: 10.47 };
const smn = { title: "Florence (Santa Maria Novella)", lat: 43.776, lng: 11.248 };
const lucca = { title: "Lucca station", lat: 43.837, lng: 10.507 };
const T0 = 1_800_000_000; // a departure, epoch seconds

// Google Directions answers, in Google's own shape.
const g = (legDur: number, steps: unknown[], dep?: number) => ({ status: "OK", routes: [{ legs: [{ duration: { value: legDur * 60 }, distance: { value: 70000 }, steps, ...(dep ? { departure_time: { value: dep } } : {}) }] }] });
const walk = (m: number) => ({ travel_mode: "WALKING", duration: { value: m * 60 } });
const ride = (m: number, type: string, from: string, to: string, dep: number, loc?: { lat: number; lng: number }) =>
  ({ travel_mode: "TRANSIT", duration: { value: m * 60 }, transit_details: { line: { short_name: "R", vehicle: { type } }, departure_stop: { name: from }, arrival_stop: { name: to, ...(loc ? { location: loc } : {}) }, departure_time: { value: dep } } });

const drive = routeFrom(g(65, [{ travel_mode: "DRIVING", duration: { value: 3900 } }]))!;
const driveToLucca = routeFrom(g(10, [{ travel_mode: "DRIVING", duration: { value: 600 } }]))!;
// From the villa by bus to Lucca, ten minutes to change, train to Florence.
const transitFromVilla = routeFrom(g(100, [walk(6), ride(24, "BUS", "Zambaldi", "Lucca Stazione", T0 + 6 * 60, lucca), ride(60, "HEAVY_RAIL", "Lucca", "Firenze S.M.N.", T0 + 40 * 60)], T0))!;
// From Lucca station: a two-minute walk to the platform, then the regional.
const transitFromLucca = routeFrom(g(62, [walk(2), ride(60, "HEAVY_RAIL", "Lucca", "Firenze S.M.N.", T0 + 2 * 60)], T0))!;

describe("the ways to make a trip (28 Nov 2026, mock approved)", () => {
  it("drive: one leg, the whole way", () => {
    const w = driveWay(drive, villa, smn);
    expect(w).toMatchObject({ kind: "drive", mins: 65, rides: 0 });
    expect(w.legs).toHaveLength(1);
  });

  it("transit: Google's rides become legs at their timetabled times; the walk to the bus is a leg", () => {
    const w = transitWay(transitFromVilla, villa, smn)!;
    expect(w.legs.map((l) => [l.mode, l.at, l.mins, l.to.title])).toEqual([
      ["walk", 0, 6, "Zambaldi"],
      ["bus", 6, 24, "Lucca Stazione"],
      ["train", 40, 60, "Florence (Santa Maria Novella)"],
    ]);
    expect(w.mins).toBe(100);
    expect(w.rides).toBe(2);
    expect(w.legs[1].to).toMatchObject({ lat: lucca.lat, lng: lucca.lng });
  });

  it("all-walking 'transit' is no transit", () => {
    expect(transitWay(routeFrom(g(90, [walk(90)]))!, villa, smn)).toBeNull();
  });

  it("mix: drive to Lucca station, ten minutes to park, then the train — 1 h 25 like the mock", () => {
    const w = mixWay(driveToLucca, lucca, transitFromLucca, villa, smn)!;
    expect(w.legs.map((l) => [l.mode, l.at, l.mins, l.to.title])).toEqual([
      ["drive", 0, 10, "Lucca station"],
      ["train", 20, 60, "Florence (Santa Maria Novella)"],
    ]);
    expect(w).toMatchObject({ kind: "mix", mins: 80, via: "Lucca station" });
  });

  it("offers drive, then the mix only when it beats transit, then transit", () => {
    const d = driveWay(drive, villa, smn), t = transitWay(transitFromVilla, villa, smn)!, m = mixWay(driveToLucca, lucca, transitFromLucca, villa, smn)!;
    expect(offerWays(d, t, m).map((w) => w.kind)).toEqual(["drive", "mix", "transit"]);
    expect(offerWays(d, { ...t, mins: 70 }, m).map((w) => w.kind)).toEqual(["drive", "transit"]);
    expect(offerWays(d, null, { ...m, mins: 200 }).map((w) => w.kind)).toEqual(["drive"]);
  });

  it("labels read 'Drive + train', 'Bus + train'; walks are left out", () => {
    expect(waysLabel([{ mode: "drive" }, { mode: "train" }])).toBe("Drive + train");
    expect(waysLabel([{ mode: "walk" }, { mode: "bus" }, { mode: "train" }, { mode: "train" }])).toBe("Bus + train");
    expect(vehicleMode("INTERCITY_BUS")).toBe("bus");
    expect(vehicleMode("FERRY")).toBe("ferry");
  });

  it("legs ride on the card's start, so moving the card moves them", () => {
    expect(clockAt("08:00:00", 20)).toBe("08:20:00");
    expect(clockAt("23:50", 20)).toBe("00:10:00");
  });

  it("reads stored legs only when there are two or more good ones", () => {
    const legs = mixWay(driveToLucca, lucca, transitFromLucca, villa, smn)!.legs;
    expect(readLegs({ legs })).toEqual(legs);
    expect(readLegs({ legs: legs.slice(0, 1) })).toBeNull();
    expect(readLegs({ legs: [{ mode: "drive" }, { mode: "train" }] })).toBeNull();
  });

  it("a run of two leg cards reads as one way's legs (the Florence run in the database)", () => {
    const legs = runLegs([
      { start_time: "08:00:00", end_time: "08:10:00", details: { mode: "drive", from: villa }, place: { title: "Lucca station", lat: lucca.lat, lng: lucca.lng } },
      { start_time: "08:25:00", end_time: "09:25:00", details: { mode: "train", from: lucca }, place: { title: "Florence (Santa Maria Novella)" } },
    ], (c) => c.place!.title!)!;
    expect(legs.map((l) => [l.mode, l.at, l.mins, l.from.title, l.to.title])).toEqual([
      ["drive", 0, 10, "Villa Zambaldi", "Lucca station"],
      ["train", 25, 60, "Lucca station", "Florence (Santa Maria Novella)"],
    ]);
  });

  it("the way a card is on: stored, else from its mode", () => {
    expect(currentWay({ way: "mix", mode: "drive" })).toBe("mix");
    expect(currentWay({ mode: "train" })).toBe("transit");
    expect(currentWay({})).toBeNull();
  });

  it("without timetable times, legs follow one another", () => {
    const r = { minutes: 50, km: 40, steps: [{ kind: "ride" as const, vehicle: "BUS", to: "A", minutes: 20 }, { kind: "walk" as const, minutes: 8 }, { kind: "ride" as const, vehicle: "RAIL", from: "B", minutes: 22 }] };
    expect(transitLegs(r, villa, smn).map((l) => [l.mode, l.at])).toEqual([["bus", 0], ["walk", 20], ["train", 28]]);
  });
});
