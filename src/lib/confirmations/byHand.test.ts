import { describe, it, expect } from "vitest";
import { blankBooking, flightTitle, flightAirport } from "./byHand";

// Don's Iceland cruise (live dates: 16 Jul – 1 Aug 2027), added by hand.
const START = "2027-07-16", END = "2027-08-01";

describe("a booking added by hand", () => {
  it("the first flight goes out on the first day", () => {
    expect(blankBooking("flight", [], START, END)).toMatchObject({ type: "flight_arrival", date: START, title: "" });
  });

  it("a second flight is the way home: from and to swapped, on the last day", () => {
    const out = { ...blankBooking("flight", [], START, END), flight_number: "AC 890", origin_airport: "Toronto YYZ", arriving_at: "Reykjavík KEF" };
    expect(blankBooking("flight", [out], START, END)).toMatchObject({
      type: "flight_departure", date: END, origin_airport: "Reykjavík KEF", arriving_at: "Toronto YYZ", address: "Reykjavík KEF",
    });
  });

  it("a second hotel checks in the day the first checks out", () => {
    const first = { ...blankBooking("hotel", [], START, END), check_out_date: "2027-07-20" };
    expect(blankBooking("hotel", [first], START, END)).toMatchObject({ type: "hotel", date: "2027-07-20", check_out_date: END });
  });

  it("a car and a cruise run the journey until changed", () => {
    expect(blankBooking("car", [], START, END)).toMatchObject({ type: "car_rental", date: START, drop_off_date: END });
    expect(blankBooking("cruise", [], START, END)).toMatchObject({ type: "cruise", date: START, check_out_date: END });
  });

  it("a flight's title is its number and route, whatever is filled in", () => {
    expect(flightTitle({ flight_number: "AC 890", origin_airport: "YYZ", arriving_at: "KEF" })).toBe("AC 890 · YYZ → KEF");
    expect(flightTitle({ flight_number: "AC 890", origin_airport: "", arriving_at: "" })).toBe("AC 890");
    expect(flightTitle({ flight_number: "", origin_airport: "YYZ", arriving_at: "" })).toBe("YYZ → ?");
  });

  it("the card sits where you land going out, and where you leave from coming home", () => {
    expect(flightAirport({ type: "flight_arrival", origin_airport: "YYZ", arriving_at: "KEF" })).toBe("KEF");
    expect(flightAirport({ type: "flight_departure", origin_airport: "KEF", arriving_at: "YYZ" })).toBe("KEF");
  });
});
