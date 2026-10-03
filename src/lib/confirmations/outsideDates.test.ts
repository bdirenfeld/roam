import { describe, it, expect } from "vitest";
import { outsideDates, bookingOutside, dayFor, shortDay } from "./outsideDates";
import type { ParsedConfirmation } from "./toCards";

// The Tuscany 2027 shape the sheet's own tests use: Tue 24 Aug to Sat 4 Sep.
const S = "2027-08-24", E = "2027-09-04";
const base = { confirmation_number: "ABC123", time: "10:05", end_time: "12:40", address: null, phone: null, website: null, notes: null };
const flight = (type: ParsedConfirmation["type"], date: string | null, flight_number: string | null = "AC890"): ParsedConfirmation =>
  ({ ...base, type, title: "Air Canada · YYZ → PSA", date, flight_number });
const villa = (date: string | null, check_out_date: string | null): ParsedConfirmation =>
  ({ ...base, type: "hotel", title: "Villa Zambaldi", date, check_out_date, time: "16:00", end_time: null });

describe("outsideDates", () => {
  it("is none on the first and last day themselves", () => {
    expect(outsideDates(S, E, S)).toEqual({ side: "none" });
    expect(outsideDates(S, E, E)).toEqual({ side: "none" });
    expect(outsideDates(S, E, "2027-08-30")).toEqual({ side: "none" });
  });
  it("counts days before the start, nearest the first day", () => {
    expect(outsideDates(S, E, "2027-08-23")).toEqual({ side: "before", days: 1, nearest: S, extendTo: "2027-08-23" });
    expect(outsideDates(S, E, "2027-08-20")).toMatchObject({ side: "before", days: 4 });
  });
  it("counts days after the end, nearest the last day", () => {
    expect(outsideDates(S, E, "2027-09-05")).toEqual({ side: "after", days: 1, nearest: E, extendTo: "2027-09-05" });
  });
  it("crosses a month and a year end cleanly", () => {
    expect(outsideDates("2027-01-01", "2027-01-10", "2026-12-30")).toMatchObject({ side: "before", days: 2 });
    expect(outsideDates("2027-11-01", "2027-11-03", "2027-11-07")).toMatchObject({ side: "after", days: 4 }); // across the clock change
  });
  it("is none when a date is missing or not a date", () => {
    expect(outsideDates(S, E, null)).toEqual({ side: "none" });
    expect(outsideDates(S, E, undefined)).toEqual({ side: "none" });
    expect(outsideDates(S, E, "TBD")).toEqual({ side: "none" });
    expect(outsideDates(null, E, "2027-08-01")).toEqual({ side: "none" });
  });
});

describe("bookingOutside", () => {
  it("says a flight the day before in one plain line, with the extension", () => {
    const n = bookingOutside(flight("flight_arrival", "2027-08-23"), S, E)!;
    expect(n.line).toBe("AC 890 flies Mon 23 Aug, a day before the trip starts. It'll go on Tue 24 Aug.");
    expect(n.button).toBe("Extend the trip to Mon 23 Aug");
    expect([n.start, n.end]).toEqual(["2027-08-23", E]);
  });
  it("says a flight home after the end", () => {
    const n = bookingOutside(flight("flight_departure", "2027-09-06"), S, E)!;
    expect(n.line).toBe("AC 890 flies Mon 6 Sep, 2 days after the trip ends. It'll go on Sat 4 Sep.");
    expect([n.start, n.end]).toEqual([S, "2027-09-06"]);
  });
  it("falls back to the title when there is no flight number", () => {
    expect(bookingOutside(flight("flight_arrival", "2027-08-23", null), S, E)!.line).toMatch(/^Air Canada · YYZ → PSA flies/);
  });
  it("is null on the first and last day", () => {
    expect(bookingOutside(flight("flight_arrival", S), S, E)).toBeNull();
    expect(bookingOutside(flight("flight_departure", E), S, E)).toBeNull();
    expect(bookingOutside(villa(S, E), S, E)).toBeNull();
  });
  it("names a hotel's check-out when the stay straddles the end", () => {
    const n = bookingOutside(villa("2027-09-01", "2027-09-05"), S, E)!;
    expect(n.line).toBe("Check-out from Villa Zambaldi is Sun 5 Sep, a day after the trip ends. It'll go on Sat 4 Sep.");
    expect(n.button).toBe("Extend the trip to Sun 5 Sep");
  });
  it("extends both edges for a stay wider than the journey, naming the check-in", () => {
    const n = bookingOutside(villa("2027-08-22", "2027-09-05"), S, E)!;
    expect(n.line).toMatch(/^Check-in at Villa Zambaldi is Sun 22 Aug, 2 days before/);
    expect(n.button).toBe("Extend the trip to Sun 22 Aug – Sun 5 Sep");
    expect([n.start, n.end]).toEqual(["2027-08-22", "2027-09-05"]);
  });
  it("extends to the check-out when both hotel dates are after the end", () => {
    const n = bookingOutside(villa("2027-09-06", "2027-09-08"), S, E)!;
    expect(n.line).toMatch(/^Check-in at Villa Zambaldi is Mon 6 Sep/);
    expect(n.end).toBe("2027-09-08");
  });
  it("says a car's drop-off after the end", () => {
    const car: ParsedConfirmation = { ...base, type: "car_rental", title: "Hertz · Pisa Airport", date: S, drop_off_date: "2027-09-05" };
    expect(bookingOutside(car, S, E)!.line).toBe("The car goes back Sun 5 Sep, a day after the trip ends. It'll go on Sat 4 Sep.");
  });
  it("is null with missing dates, or with no journey dates", () => {
    expect(bookingOutside(flight("flight_arrival", null), S, E)).toBeNull();
    expect(bookingOutside(villa(null, null), S, E)).toBeNull();
    expect(bookingOutside(villa(S, null), S, E)).toBeNull();
    expect(bookingOutside(flight("flight_arrival", "2027-08-23"), null, null)).toBeNull();
  });
});

describe("dayFor", () => {
  const days = [{ id: "d1", date: S }, { id: "d6", date: "2027-08-29" }, { id: "d12", date: E }];
  it("is the booking's own day, else the nearest edge", () => {
    expect(dayFor(days, "2027-08-29")?.id).toBe("d6");
    expect(dayFor(days, "2027-08-23")?.id).toBe("d1");
    expect(dayFor(days, "2027-09-07")?.id).toBe("d12");
  });
  it("is null with no date, no days, or a gap inside the journey", () => {
    expect(dayFor(days, null)).toBeNull();
    expect(dayFor([], S)).toBeNull();
    expect(dayFor(days, "2027-08-30")).toBeNull();
  });
});

describe("shortDay", () => {
  it("reads like the founder's example", () => expect(shortDay("2027-08-23")).toBe("Mon 23 Aug"));
});
