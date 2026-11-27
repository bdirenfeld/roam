import { describe, it, expect } from "vitest";
import { stayGaps, dayGapFlags, clock } from "./flightGap";
import type { FlightCard } from "@/lib/week/flightTime";

// His journeys as they sit in the database (27 Nov 2026).
const days = (dates: string[]) => dates.map((date, i) => ({ id: `d${i}`, date }));
const fl = (id: string, day: number, start: string, end: string | null, from: string, to: string): FlightCard =>
  ({ id, day_id: `d${day}`, start_time: start, end_time: end, details: { origin_airport: from, arriving_at: to }, place: { sub_type: "flight_arrival" }, status: "in_itinerary" });

describe("flights against the hotel's hours (27 Nov 2026)", () => {
  it("New York: LGA 10:55 AM, 11 Howard from 2:00 PM, is 3 h early; the 4 PM flight home after a 2:30 PM check-out says nothing", () => {
    const ds = days(["2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"]);
    const flights = [fl("in", 0, "09:20:00", "10:55:00", "YYZ", "LGA"), fl("out", 3, "16:00:00", "17:47:00", "LGA", "YYZ")];
    const g = stayGaps(ds, flights, { checkInDate: "2026-07-23", checkInTime: "14:00:00", checkOutDate: "2026-07-26", checkOutTime: "14:30:00" });
    expect(g.arrive).toEqual({ cardId: "in", land: "10:55", hours: 3 });
    expect(g.leave).toBeNull();
    expect(dayGapFlags(g, "howard")).toEqual({ howard: "You land 3 h early" });
  });

  it("New York with no check-out time: taken as 11 AM, so the 4 PM flight means leaving at 1 PM, 2 h after", () => {
    const ds = days(["2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"]);
    const flights = [fl("in", 0, "09:20:00", "10:55:00", "YYZ", "LGA"), fl("out", 3, "16:00:00", "17:47:00", "LGA", "YYZ")];
    const g = stayGaps(ds, flights, { checkInDate: "2026-07-23", checkInTime: "14:00:00", checkOutDate: "2026-07-26", checkOutTime: null });
    expect(g.leave).toEqual({ cardId: "out", flight: "16:00", leaveAt: "13:00", hours: 2, checkOut: "11:00" });
    expect(dayGapFlags(g, "howard").out).toBe("Late check-out?");
  });

  it("Dallas says nothing: lands 4:49 PM after a 3 PM check-in, and the noon flight home leaves before the 11 AM check-out matters", () => {
    const ds = days(["2027-03-14", "2027-03-15", "2027-03-16", "2027-03-17"]);
    const flights = [fl("aa1993", 0, "14:07:00", "16:49:00", "Toronto Pearson (YYZ)", "Dallas Fort Worth (DFW)"), fl("aa1111", 3, "12:00:00", "16:05:00", "Dallas Fort Worth (DFW)", "Toronto Pearson (YYZ)")];
    expect(stayGaps(ds, flights, { checkInDate: "2027-03-14", checkInTime: "15:00:00", checkOutDate: "2027-03-17", checkOutTime: null })).toEqual({ arrive: null, leave: null });
  });

  it("Tuscany: the overnight flight lands at Pisa the next morning, hours before the villa's 5 PM; the 1:45 PM flight home says nothing", () => {
    const ds = days(Array.from({ length: 13 }, (_, i) => `2027-08-${String(24 + i).padStart(2, "0")}`).map((d) => d > "2027-08-31" ? `2027-09-${String(Number(d.slice(8)) - 31).padStart(2, "0")}` : d));
    const flights = [fl("yyz", 0, "19:00:00", "11:30:00", "YYZ", "PSA"), fl("out", 12, "13:45:00", "21:30:00", "PSA", "YYZ")];
    const g = stayGaps(ds, flights, { checkInDate: "2027-08-25", checkInTime: "17:00:00", checkOutDate: "2027-09-05", checkOutTime: null });
    expect(g.arrive).toEqual({ cardId: "yyz", land: "11:30", hours: 5 });
    expect(g.leave).toBeNull();
  });

  it("just under the line says nothing: landing 2 h 59 before check-in, leaving 1 h 59 after check-out", () => {
    const ds = days(["2027-01-01", "2027-01-02"]);
    const flights = [fl("in", 0, "08:00:00", "11:01:00", "YYZ", "LGA"), fl("out", 1, "15:59:00", "18:00:00", "LGA", "YYZ")];
    expect(stayGaps(ds, flights, { checkInDate: "2027-01-01", checkInTime: "14:00:00", checkOutDate: "2027-01-02", checkOutTime: "11:00:00" })).toEqual({ arrive: null, leave: null });
  });

  it("a hotel with no check-in time, or a landing on another day, says nothing", () => {
    const ds = days(["2027-01-01", "2027-01-02"]);
    const flights = [fl("in", 0, "06:00:00", "08:00:00", "YYZ", "LGA")];
    expect(stayGaps(ds, flights, { checkInDate: "2027-01-01", checkInTime: null, checkOutDate: null, checkOutTime: null }).arrive).toBeNull();
    expect(stayGaps(ds, flights, { checkInDate: "2027-01-02", checkInTime: "15:00:00", checkOutDate: null, checkOutTime: null }).arrive).toBeNull();
    expect(stayGaps([], flights, { checkInDate: "2027-01-01", checkInTime: "15:00:00", checkOutDate: null, checkOutTime: null })).toEqual({ arrive: null, leave: null });
  });

  it("clock reads 10:55 AM, 12:30 PM, 12:05 AM", () => {
    expect([clock("10:55"), clock("12:30:00"), clock("00:05")]).toEqual(["10:55 AM", "12:30 PM", "12:05 AM"]);
  });
});
