import { describe, it, expect } from "vitest";
import { matchBooking, otherBookings } from "./match";
import type { ParsedConfirmation } from "./toCards";

const b = (type: ParsedConfirmation["type"], title: string) => ({ type, title, confirmation_number: "X", date: null, time: null, end_time: null, address: null, phone: null, website: null, notes: null }) as ParsedConfirmation;
// His New York Expedia booking: flight there, flight home, the hotel — and a car for the package case.
const pkg = [b("flight_arrival", "AC8458 YYZ → LGA"), b("flight_departure", "AC713 LGA → YYZ"), b("hotel", "11 Howard"), b("car_rental", "Hertz LGA")];

describe("the card's own booking in a package", () => {
  it("an arrival pin takes the flight there; the rest are offered", () => {
    const i = matchBooking("flight_arrival", pkg);
    expect(pkg[i].title).toBe("AC8458 YYZ → LGA");
    expect(otherBookings(pkg, i).map((x) => x.type)).toEqual(["flight_departure", "hotel", "car_rental"]);
  });
  it("a departure pin takes the flight home", () => expect(pkg[matchBooking("flight_departure", pkg)].title).toBe("AC713 LGA → YYZ"));
  it("a hotel pin takes the hotel", () => expect(pkg[matchBooking("hotel", pkg)].title).toBe("11 Howard"));
  it("a one-way ticket on an arrival pin still fits", () => expect(matchBooking("flight_arrival", [b("flight_departure", "one way")])).toBe(0));
  it("a car desk pin takes the car", () => expect(pkg[matchBooking("transit", pkg)].title).toBe("Hertz LGA"));
  it("a restaurant pin with a flight email fits nothing, so everything is offered", () => {
    expect(matchBooking("restaurant", pkg)).toBe(-1);
    expect(otherBookings(pkg, -1)).toHaveLength(4);
  });
});
