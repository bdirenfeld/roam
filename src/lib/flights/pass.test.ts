import { describe, it, expect } from "vitest";
import { flightPass, isPassFlight, passDate, airportSearch } from "./pass";

// Real rows (19 Nov 2026): Rome AC890 out, Porter to Vegas, Tuscany's placeholder.
const rome = { start_time: "19:45:00", end_time: "10:20:00", details: { airline: "Air Canada", flight_number: "AC890", origin_airport: "Toronto-Pearson Int. (YYZ)", arriving_at: "Roma Fiumicino Airport (FCO)", seat: "39C", departure_time: "19:45" }, place: { sub_type: "flight_arrival" } };

describe("the boarding pass (19 Nov 2026)", () => {
  it("Rome AC890, kept on its landing day Wed 22 Apr: YYZ 7:45 PM Tue 21 Apr → FCO 10:20 AM Wed 22 Apr, 8 h 35, next day", () => {
    const p = flightPass(rome, "2026-04-22");
    expect([p.airline, p.number, p.from.code, p.from.name, p.to.code, p.to.name]).toEqual(["Air Canada", "AC 890", "YYZ", "Toronto-Pearson", "FCO", "Roma Fiumicino"]);
    expect([p.departs, p.arrives, p.departDate, p.arriveDate, p.nextDay, p.minutes]).toEqual(["19:45:00", "10:20:00", "2026-04-21", "2026-04-22", true, 515]);
  });

  it("Porter to Vegas: the airline's 'Ltd.' goes; same day, 5 h 07", () => {
    const p = flightPass({ start_time: "11:30:00", end_time: "13:37:00", details: { airline: "Porter Airlines (Canada) Ltd.", flight_number: "PD653", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Harry Reid International (LAS)" } }, "2026-11-04");
    expect([p.airline, p.number, p.nextDay, p.minutes, p.to.name]).toEqual(["Porter Airlines", "PD 653", false, 307, "Harry Reid"]);
  });

  it("Tuscany's takeoff card has no end: the landing card's 11:30 lands it the next day", () => {
    const p = flightPass({ start_time: "19:00:00", end_time: null, details: { origin_airport: "YYZ", arriving_at: "PSA" } }, "2027-08-24", "11:30:00");
    expect([p.from.code, p.to.code, p.arrives, p.arriveDate, p.nextDay, p.minutes]).toEqual(["YYZ", "PSA", "11:30:00", "2027-08-25", true, 630]);
  });

  it("an airport with no known clock: no length, an earlier landing still means the next day", () => {
    const p = flightPass({ start_time: "22:00:00", end_time: "06:00:00", details: { origin_airport: "Somewhere Field", arriving_at: "Elsewhere Strip" } }, "2026-05-01");
    expect([p.from.code, p.minutes, p.arriveDate, p.nextDay]).toEqual([null, null, "2026-05-02", true]);
  });

  it("only a flight that names both airports gets the pass; 'Land in Sydney' keeps the old card", () => {
    expect(isPassFlight(rome.details, "flight_arrival")).toBe(true);
    expect(isPassFlight({ title: "Land in Sydney" }, "flight_arrival")).toBe(false);
    expect(isPassFlight(rome.details, "hotel")).toBe(false);
  });

  it("a typed airport is looked up as an airport: 'Naples NAP' found the city in the live test", () => {
    expect(["Naples NAP", "Pisa International Airport", "Roma Fiumicino Airport (FCO)", "Flughafen München"].map(airportSearch))
      .toEqual(["Naples NAP airport", "Pisa International Airport", "Roma Fiumicino Airport (FCO)", "Flughafen München"]);
  });

  it("dates read like the week's", () => {
    expect(passDate("2026-04-22")).toBe("Wed 22 Apr");
  });
});

describe("dates spelled by hand (19 Nov 2026)", () => {
  it("September is 'Sep', never ICU's 'Sept'", () => {
    expect(passDate("2027-09-05")).toBe("Sun 5 Sep");
  });
});

describe("the flight number on the pass (27 Nov 2026: it read \"19 93\")", () => {
  it("never splits a number with no letters; adds the airline's code when known", async () => {
    const { flightNumberLabel } = await import("./pass");
    expect(flightNumberLabel("1993", "American Airlines")).toBe("AA 1993");
    expect(flightNumberLabel("1993", "Some Small Air")).toBe("1993");
    expect(flightNumberLabel("1993", null)).toBe("1993");
    expect(flightNumberLabel("AC890", "Air Canada")).toBe("AC 890");
    expect(flightNumberLabel("ac 890", null)).toBe("AC 890");
    expect(flightNumberLabel("B6123", "JetBlue")).toBe("B6 123");
    expect(flightNumberLabel("", "Air Canada")).toBeNull();
  });
});
