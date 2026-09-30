import { describe, it, expect } from "vitest";
import { isAirport, dayBounds, freeWithin, boundBlocks } from "./airports";

const stop = (title: string, start: string | null, o: Record<string, unknown> = {}) => ({ start_time: start, end_time: null, place: { title, sub_type: "transit", types: [], ...o } });
const last = { first: false, last: true }, first = { first: true, last: false }, middle = { first: false, last: false };

describe("isAirport", () => {
  it("a flight, anything Google calls an airport, or anything named one", () => {
    expect(isAirport(stop("Pisa International Airport", "10:00"))).toBe(true);           // Tuscany, saved as transit
    expect(isAirport(stop("Aeroporto di Firenze", "10:00"))).toBe(true);
    expect(isAirport(stop("Terminal 3", "10:00", { types: ["airport"] }))).toBe(true);
    expect(isAirport(stop("Flight to Toronto — Air Canada", "12:25", { sub_type: "flight_arrival" }))).toBe(true);
    expect(isAirport(stop("Roma Termini", "09:49", { types: ["train_station"] }))).toBe(false);
    expect(isAirport({ place: null })).toBe(false);
  });
});

describe("dayBounds", () => {
  it("the last day ends an hour before the airport, three before a flight", () => {
    expect(dayBounds([stop("Pisa International Airport", "10:00")], last)).toEqual({ from: null, until: 9 * 60 });
    expect(dayBounds([stop("Flight home", "14:30", { sub_type: "flight_arrival" })], last).until).toBe(11 * 60 + 30);
  });
  it("the first day starts an hour and a half after landing", () => {
    expect(dayBounds([stop("Pisa International Airport", "11:30")], first)).toEqual({ from: 13 * 60, until: null });
    // A flight card with the landing in its end: the later of the two.
    expect(dayBounds([{ start_time: "07:00", end_time: "11:30", place: { title: "AC 890", sub_type: "flight_arrival" } }], first).from).toBe(13 * 60);
  });
  it("a middle day, an airport with no time, or no airport: no bounds", () => {
    expect(dayBounds([stop("Pisa International Airport", "10:00")], middle)).toEqual({ from: null, until: null });
    expect(dayBounds([stop("Pisa International Airport", null)], last)).toEqual({ from: null, until: null });
    expect(dayBounds([stop("Villa Zambaldi", "08:00", { sub_type: "hotel" })], last)).toEqual({ from: null, until: null });
  });
});

describe("freeWithin and boundBlocks", () => {
  it("a morning departure leaves nothing to plan; an evening one, half a day", () => {
    expect(freeWithin({ from: null, until: 9 * 60 }, 0.5)).toBe(0);
    expect(freeWithin({ from: null, until: 16 * 60 }, 0.5)).toBe(0.5);
    expect(freeWithin({ from: 16 * 60, until: null }, 0.5)).toBe(0);
    expect(freeWithin({ from: 13 * 60, until: null }, 1)).toBe(0.5);
    expect(boundBlocks({ from: 13 * 60, until: 16 * 60 })).toEqual([{ start: 0, end: 780 }, { start: 960, end: 1440 }]);
  });
});
