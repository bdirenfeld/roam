import { describe, it, expect } from "vitest";
import { flightsInAir, flightBands, placeName, type FlightCard } from "./flightTime";

// The flights as they sit in the database (18 Nov 2026), one journey at a time.
const days = (dates: string[]) => dates.map((date, i) => ({ id: `d${i}`, date }));
const card = (id: string, day: number, start: string | null, end: string | null, details: Record<string, unknown>, place: Record<string, unknown> | null = null, status = "in_itinerary"): FlightCard =>
  ({ id, day_id: `d${day}`, start_time: start, end_time: end, details, place, status });

describe("time in the air (18 Nov 2026)", () => {
  it("Tuscany's two placeholders: YYZ takeoff 7 pm, landing at Pisa 11:30 the next day, says 'to Pisa'", () => {
    const ds = days(["2027-08-24", "2027-08-25"]);
    const cards = [
      card("yyz", 0, "19:00:00", null, { origin_airport: "YYZ", arriving_at: "PSA" }, { title: "YYZ Terminal 1", sub_type: "flight_arrival" }),
      card("psa", 1, "11:30:00", "12:30:00", { origin_airport: "YYZ", arriving_at: "PSA", title: "Land at Pisa Airport" }, { title: "Pisa International Airport", sub_type: "flight_arrival" }),
    ];
    const f = flightsInAir(ds, cards);
    expect(f.map((x) => [x.start, x.end, x.card.id, x.to])).toEqual([[19 * 60, 1440 + 690, "yyz", "Pisa"]]);
    const b = flightBands(ds, cards, 7, 23);
    expect(b.get("d0")).toEqual([{ from: 1140, to: 1440, label: true, takeoff: true, card: cards[0], dest: "Pisa" }]);
    expect(b.get("d1")).toEqual([{ from: 420, to: 690, label: true, takeoff: false, card: cards[0], dest: "Pisa" }]);
  });

  it("Rome's one card, 7:45 pm → 10:20 am: the end before the start is the next morning", () => {
    const ds = days(["2026-04-22", "2026-04-23"]);
    const rome = card("ac890", 0, "19:45:00", "10:20:00", { origin_airport: "Toronto-Pearson Int. (YYZ)", arriving_at: "Roma Fiumicino Airport (FCO)" }, { title: "Flight to Rome — Air Canada", sub_type: "flight_arrival" });
    expect(flightsInAir(ds, [rome]).map((x) => [x.start, x.end, x.to])).toEqual([[1185, 1440 + 620, "Roma Fiumicino"]]);
  });

  it("Vegas entered twice (departure and arrival cards, same times) shades once", () => {
    const ds = days(["2026-11-04"]);
    const both = [
      card("arr", 0, "11:30:00", "13:37:00", { origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Harry Reid International (LAS)" }),
      card("dep", 0, "11:30:00", "13:37:00", { origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Las Vegas (LAS)" }),
    ];
    expect(flightsInAir(ds, both)).toHaveLength(1);
    expect(flightsInAir(ds, both)[0].to).toBe("Harry Reid");
  });

  it("no airports named, no band: 'Land in Sydney 7:00–9:30' is time at the airport; a cut card and a takeoff with no landing get nothing", () => {
    const ds = days(["2026-02-15", "2026-02-16"]);
    expect(flightsInAir(ds, [card("syd", 0, "07:00:00", "09:30:00", { title: "Land in Sydney" }, { title: "Sydney Kingsford Smith Airport", sub_type: "flight_arrival" })])).toEqual([]);
    expect(flightsInAir(ds, [card("cut", 0, "07:00:00", "09:30:00", { origin_airport: "YYZ", arriving_at: "LGA" }, null, "cut")])).toEqual([]);
    expect(flightsInAir(ds, [card("home", 0, "11:00:00", null, { origin_airport: "PSA", arriving_at: "YYZ" })])).toEqual([]);
  });

  it("a landing more than two days later isn't this flight's", () => {
    const ds = days(["2027-08-24", "2027-08-25", "2027-08-26", "2027-08-27"]);
    const cards = [card("a", 0, "19:00:00", null, { origin_airport: "YYZ", arriving_at: "PSA" }), card("b", 3, "11:30:00", null, { origin_airport: "YYZ", arriving_at: "PSA" })];
    expect(flightsInAir(ds, cards)).toEqual([]);
  });

  it("a short daytime flight inside the grid gets a band but no label under 2 h", () => {
    const ds = days(["2026-07-23"]);
    const ny = card("ny", 0, "09:20:00", "10:55:00", { origin_airport: "YYZ", arriving_at: "LGA" });
    expect(flightBands(ds, [ny], 7, 23).get("d0")).toEqual([{ from: 560, to: 655, label: false, takeoff: true, card: ny, dest: "LGA" }]);
  });

  it("names the destination plainly", () => {
    expect(["PSA", "Roma Fiumicino Airport (FCO)", "Toronto Pearson (YYZ)", "Pisa International Airport", "Harry Reid International (LAS)"].map(placeName))
      .toEqual(["PSA", "Roma Fiumicino", "Toronto Pearson", "Pisa", "Harry Reid"]);
  });
});
