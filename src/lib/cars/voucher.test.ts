import { describe, it, expect } from "vitest";
import { rentalVoucher, companyOf, shortWhere, readPaid, paidLabel, isReturnCard, type VoucherCard } from "./voucher";

// The Vegas rental as stored (19 Nov 2026): a pick-up card and a return card on the Hertz desk.
const desk = { title: "Hertz Car Rental - Las Vegas - Harry Reid International Airport (LAS)", sub_type: "car_rental" };
const notes = "Standard Elite SUV (AUDI Q3, CADILLAC XT4 or similar), Unlimited mileage";
const pickup: VoucherCard = { id: "pu", day_id: "n4", place_id: "hz", start_time: "13:30:00", confirmed: true, place: desk, details: {
  title: "Pick up rental car · Alamo · Harry Reid International Airport", phone: "844-370-7395", notes, drop_off: "2026-11-08",
  paid_total: 279.31, paid_currency: "USD", drop_off_location: "Harry Reid International Airport, 7135 Gilespie St, Las Vegas, NV 89119, US" } };
const back: VoucherCard = { id: "rt", day_id: "n8", place_id: "hz", start_time: "12:00:00", confirmed: true, place: desk, details: {
  title: "Return the rental car · Harry Reid International Airport, 7135 Gilespie St, Las Vegas, NV 89119, US", phone: "844-370-7395", notes, drop_off: "2026-11-08",
  drop_off_location: "Harry Reid International Airport, 7135 Gilespie St, Las Vegas, NV 89119, US" } };
const both = [{ card: pickup, date: "2026-11-04" }, { card: back, date: "2026-11-08" }];

describe("the rental voucher (19 Nov 2026)", () => {
  it("Vegas pick-up: Alamo, Wed 4 Nov 1:30 PM → Sun 8 Nov 12:00 PM at Harry Reid, 4 days, US$279.31", () => {
    const v = rentalVoucher(pickup, "2026-11-04", both);
    expect(v.side).toBe("pickup");
    expect(v.company).toBe("Alamo");
    expect(v.pickup).toEqual({ date: "2026-11-04", time: "13:30:00", where: "Harry Reid International Airport (LAS)" });
    expect(v.dropoff).toEqual({ date: "2026-11-08", time: "12:00:00", where: "Harry Reid International Airport" });
    expect([v.days, v.phone, v.booked]).toEqual([4, "844-370-7395", true]);
    expect(v.paid && paidLabel(v.paid)).toBe("US$279.31");
  });

  it("the return card shows the whole rental too, the price from the pick-up", () => {
    const v = rentalVoucher(back, "2026-11-08", both);
    expect(v.side).toBe("return");
    expect([v.company, v.pickup.date, v.pickup.time, v.dropoff.time, v.days]).toEqual(["Alamo", "2026-11-04", "13:30:00", "12:00:00", 4]);
    expect(v.paid?.amount).toBe(279.31);
  });

  it("the Tuscany van placeholder: not booked, car class set, the lines blank until booked", () => {
    const pisa = { title: "Pisa Airport car rental", sub_type: "car_rental" };
    const up: VoucherCard = { id: "v1", day_id: "a25", place_id: "pr", start_time: "12:30:00", confirmed: false, place: pisa, details: { title: "Pick up rental van", car_class: "Van for 5 + luggage", drop_off: "2027-09-05", drop_off_location: "Pisa Airport" } };
    const down: VoucherCard = { id: "v2", day_id: "s05", place_id: "pr", start_time: "10:45:00", confirmed: false, place: pisa, details: { title: "Return the rental van", car_class: "Van for 5 + luggage", drop_off: "2027-09-05" } };
    const v = rentalVoucher(up, "2027-08-25", [{ card: up, date: "2027-08-25" }, { card: down, date: "2027-09-05" }]);
    expect([v.company, v.days, v.dropoff.time, v.dropoff.where, v.carClass, v.pickupInfo, v.fuel, v.booked, v.paid]).toEqual([null, 11, "10:45:00", "Pisa Airport", "Van for 5 + luggage", null, null, false, null]);
    expect(isReturnCard(down)).toBe(true);
  });

  it("a pick-up with no return card still knows its drop-off day", () => {
    const v = rentalVoucher(pickup, "2026-11-04", [{ card: pickup, date: "2026-11-04" }]);
    expect([v.dropoff.date, v.dropoff.time, v.days]).toEqual(["2026-11-08", null, 4]);
  });

  it("reads the company and the place briefly", () => {
    expect(companyOf({ ...pickup, details: { title: "Pick up rental car · Hertz · Pisa Airport" } })).toBe("Hertz");
    expect(companyOf({ ...pickup, details: { title: "Pick up rental car · Alamo", company: "Avis" } })).toBe("Avis");
    expect(companyOf(back)).toBeNull();
    expect(shortWhere("Pisa International Airport, Piazzale D'Ascanio")).toBe("Pisa International Airport");
  });

  it("a typed price needs its currency: '€450', '450 EUR', 'US$279.31'; a bare '$450' is unclear", () => {
    expect(["€450", "450 EUR", "US$279.31", "C$600", "£300", "$450", "soon"].map(readPaid)).toEqual([
      { amount: 450, currency: "EUR" }, { amount: 450, currency: "EUR" }, { amount: 279.31, currency: "USD" },
      { amount: 600, currency: "CAD" }, { amount: 300, currency: "GBP" }, null, null,
    ]);
  });
});
