import { describe, it, expect } from "vitest";
import routes from "./fixtures/routes.json";
import { routeFrom, bestWay, changes, leaveBy, travelCard, stepLine, hasCar, dayTrips, directionsUrl, clock, type TripCard } from "./gettingThere";
import { km } from "./dayGroups";

// Real Google Directions answers, trimmed (fixtures/routes.json, 30 Sep 2026).
const romeTransit = routeFrom(routes.romeTivoliTransit)!;
const romeDrive = routeFrom(routes.romeTivoliDrive)!;
const crDrive = routeFrom(routes.tamarindoPaloVerdeDrive)!;

describe("routeFrom reads Google's answer", () => {
  it("minutes, km and the rides: Rome to Tivoli is Metro B then a bus", () => {
    expect(romeTransit.minutes).toBe(69);
    const rides = romeTransit.steps.filter((s) => s.kind === "ride");
    expect(rides.map((s) => s.vehicle)).toEqual(["SUBWAY", "BUS"]);
    expect(changes(romeTransit)).toBe(1);
    expect(stepLine(rides[0])).toBe("Metro B from Termini to Ponte Mammolo (9 stops, 15 min)");
    expect(crDrive.minutes).toBe(152);
  });
  it("no route (rural Costa Rica has no public transport data): null", () => {
    expect(routeFrom(routes.tamarindoPaloVerdeTransit)).toBeNull();
    expect(routeFrom(null)).toBeNull();
  });
});

describe("bestWay", () => {
  it("no car saved: Rome to Tivoli by metro and bus, though driving is quicker", () => {
    expect(bestWay(romeDrive, romeTransit, true)).toBe("transit");
  });
  it("with a rental car: drive it", () => {
    expect(bestWay(romeDrive, romeTransit, true, true)).toBe("drive");
  });
  it("no public transport: drive; neither: nothing", () => {
    expect(bestWay(crDrive, null, true)).toBe("drive");
    expect(bestWay(null, null, true)).toBeNull();
  });
  it("a car is a saved rental, by name or Google type", () => {
    expect(hasCar([{ place: { title: "Hertz Liberia Airport" } }])).toBe(true);
    expect(hasCar([{ place: { title: "Adobe", details: { types: ["car_rental"] } } }])).toBe(true);
    expect(hasCar([{ place: { title: "Modern Casita" } }, { place: null }])).toBe(false);
  });
});

describe("leaving", () => {
  it("in time to arrive, rounded to five minutes; never before 8 — the day moves instead", () => {
    expect(leaveBy(11 * 60, 69)).toEqual({ leave: 9 * 60 + 40, shift: 0 });
    // Palo Verde planned at 9:00, 2 h 32 away: leave at 8:00 and start 2 h 45 later.
    expect(leaveBy(9 * 60, 152)).toEqual({ leave: 8 * 60, shift: 8 * 60 - (Math.floor((9 * 60 - 152 - 10) / 5) * 5) });
    expect(clock(8 * 60)).toBe("8:00 am");
    expect(clock(13 * 60 + 5)).toBe("1:05 pm");
  });
});

describe("the travel card", () => {
  it("public transport: the steps, the other way, the time back", () => {
    const c = travelCard({ to: "Villa d'Este", home: "Hotel Artemide", drive: romeDrive, transit: romeTransit, kids: true, leave: 9 * 60 + 40 })!;
    expect(c.title).toBe("Getting to Villa d'Este");
    expect(c.mode).toBe("transit");
    expect(c.notes).toContain("By public transport from Hotel Artemide: about 1 h 9 min. Leave by 9:40 am.");
    expect(c.notes).toContain("• Metro B from Termini to Ponte Mammolo");
    expect(c.notes).toContain("1 change.");
    expect(c.notes).toContain("Driving instead: about 46 min");
    expect(c.notes).toContain("Back to Hotel Artemide: about 1 h 9 min.");
  });
  it("a drive with no public transport, and no car saved: says so", () => {
    const c = travelCard({ to: "Palo Verde National Park", home: "Modern Casita", drive: crDrive, transit: null, kids: true, leave: 8 * 60 })!;
    expect(c.notes).toContain("Drive from Modern Casita: about 2 h 32 min");
    expect(c.notes).toContain("You'll need a car, a taxi or a driver");
    expect(c.notes).toContain("Google has no route for here");
    expect(travelCard({ to: "x", home: "y", drive: crDrive, transit: null, kids: true, car: true, leave: 480 })!.notes).not.toContain("need a car");
  });
  it("links the route in the mode it chose", () => {
    expect(directionsUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, "transit")).toBe("https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4&travelmode=transit");
  });
});

describe("dayTrips: which days get a travel card", () => {
  const card = (id: string, day: string | null, title: string, lat: number, lng: number, o: Partial<TripCard> = {}): TripCard =>
    ({ id, day_id: day, start_time: "09:00:00", position: 1, details: null, place: { title, type: "activity", sub_type: "guided", lat, lng }, ...o });
  const casita = card("h", "d1", "Modern Casita", 10.3, -85.84, { place: { title: "Modern Casita", type: "logistics", sub_type: "hotel", lat: 10.3, lng: -85.84 } });
  const pv = card("pv", "d3", "Palo Verde National Park", 10.35, -85.32);
  const sky = card("sky", "d3", "Skyline Guanacaste", 10.62, -85.5, { start_time: "14:00:00" });
  const beach = card("b", "d2", "Playa Avellanas", 10.23, -85.83);
  const days = ["d1", "d2", "d3"];

  it("Costa Rica: the day with Palo Verde, once, to the first far place; not the beach 8 km away", () => {
    const t = dayTrips(days, [casita, pv, sky, beach], new Set(["pv", "sky", "b"]), 25, km);
    expect(t.map((x) => [x.dayId, x.target.id, x.home.id])).toEqual([["d3", "pv", "h"]]);
  });
  it("only what Plan my trip just put; a day that has a travel card already is left alone", () => {
    expect(dayTrips(days, [casita, pv, beach], new Set(["b"]), 25, km)).toEqual([]);
    const done = card("t", "d3", "Getting to Palo Verde", 0, 0, { details: { getting_there: { to: "pv" } }, place: null });
    expect(dayTrips(days, [casita, pv, done], new Set(["pv"]), 25, km)).toEqual([]);
  });
  it("no stay saved: nothing to measure from", () => {
    expect(dayTrips(days, [pv], new Set(["pv"]), 25, km)).toEqual([]);
  });
});
