import { describe, it, expect } from "vitest";
import { firstName, joinFlight, passengerName, sameFlight, travellersOf, viewFor, withBoardingPass, withPersonField } from "./travellers";

// The real Chris Voss cards (27 Nov 2026): one flight, two confirmations, two cards.
const brennan = {
  seat: "15E", title: "American Airlines · YYZ → DFW", airline: "American Airlines", flight_number: "1993",
  confirmation: "HHDSHC", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Dallas Fort Worth (DFW)",
  paid_total: 795.77, paid_currency: "CAD", notes: "Flight 1993, Economy/Coach (Q), Seat 15E, 3h 42m duration, Terminal 3 to Terminal 0",
};
const isha = {
  ...brennan, seat: "15D", confirmation: "HKZZSL",
  notes: "Passenger: Isha Seth. Economy / Coach (Q). Seat 15D. Duration 3h 42m. Carry-on bag included.",
};

describe("everyone on one flight card", () => {
  it("a card with one person reads as one person, from its own fields", () => {
    const t = travellersOf(isha);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ name: "Isha Seth", seat: "15D", confirmation: "HKZZSL" });
    expect(firstName(t[0].name)).toBe("Isha");
    expect(passengerName(brennan.notes)).toBeNull();
  });

  it("Isha's confirmation joins Brennan's card: two people, the flight's price added once each", () => {
    const joined = joinFlight(brennan, isha);
    const t = travellersOf(joined);
    expect(t.map((p) => [p.seat, p.confirmation])).toEqual([["15E", "HHDSHC"], ["15D", "HKZZSL"]]);
    expect(t[1].name).toBe("Isha Seth");
    expect(joined.paid_total).toBe(1591.54);
    // The card's own fields stay the first person's.
    expect([joined.seat, joined.confirmation]).toEqual(["15E", "HHDSHC"]);
  });

  it("the same confirmation uploaded twice changes nothing", () => {
    const once = joinFlight(brennan, isha);
    expect(joinFlight(once, isha)).toEqual(once);
  });

  it("a price in another currency is not added to this one", () => {
    expect(joinFlight(brennan, { ...isha, paid_currency: "USD" }).paid_total).toBe(795.77);
  });

  it("swiped to Isha, the card shows her seat, confirmation and notes; the flight stays the flight", () => {
    const v = viewFor(joinFlight(brennan, isha), 1);
    expect([v.seat, v.confirmation]).toEqual(["15D", "HKZZSL"]);
    expect(v.notes).toMatch(/^Passenger: Isha Seth/);
    expect(v.flight_number).toBe("1993");
  });

  it("a change to Isha's seat is hers; a change to the first person's is the card's own", () => {
    const j = joinFlight(brennan, isha);
    const a = withPersonField(j, 1, "seat", "16A");
    expect(travellersOf(a)[1].seat).toBe("16A");
    expect(a.seat).toBe("15E");
    const b = withPersonField(j, 0, "seat", "14C");
    expect(b.seat).toBe("14C");
    expect(travellersOf(b)[1].seat).toBe("15D");
  });

  it("a boarding pass goes on one person, and a one-person card gets its list for it", () => {
    const bp = { path: "t/c/pass.png", name: "pass.png", type: "image/png" };
    const one = withBoardingPass(isha, 0, bp);
    expect(travellersOf(one)[0]).toMatchObject({ name: "Isha Seth", seat: "15D", boarding_pass: bp });
    const two = withBoardingPass(joinFlight(brennan, isha), 1, bp);
    expect(travellersOf(two).map((t) => !!t.boarding_pass)).toEqual([false, true]);
    expect(travellersOf(withBoardingPass(two, 1, null))[1].boarding_pass).toBeNull();
  });

  it("the same flight: same number, same day, same airport out", () => {
    const at = (details: unknown, date: string | null = "2027-03-14") => ({ details, date });
    expect(sameFlight(at(brennan), at(isha))).toBe(true);
    expect(sameFlight(at(brennan), at({ ...isha, flight_number: "AA 1993" }))).toBe(true);
    expect(sameFlight(at(brennan), at(isha, "2027-03-17"))).toBe(false);
    expect(sameFlight(at(brennan), at({ ...isha, flight_number: "1111" }))).toBe(false);
    expect(sameFlight(at(brennan), at({ ...isha, origin_airport: "Montréal (YUL)" }))).toBe(false);
    expect(sameFlight(at({ ...brennan, flight_number: null }), at(isha))).toBe(false);
  });
});

describe("a family on one confirmation", () => {
  it("becomes one card with everyone on it, each with their seat and the shared confirmation", async () => {
    const { withPassengers } = await import("./travellers");
    const d = withPassengers({ ...brennan, seat: null }, [{ name: "Brennan Direnfeld", seat: "15E" }, { name: "Isha Seth", seat: "15D" }, { name: "Sai Direnfeld", seat: "15F" }]);
    const t = travellersOf(d);
    expect(t.map((p) => [firstName(p.name), p.seat, p.confirmation])).toEqual([["Brennan", "15E", "HHDSHC"], ["Isha", "15D", "HHDSHC"], ["Sai", "15F", "HHDSHC"]]);
  });

  it("one passenger only names the card; none changes nothing", async () => {
    const { withPassengers } = await import("./travellers");
    expect(travellersOf(withPassengers(brennan, [{ name: "Brennan Direnfeld" }]))).toHaveLength(1);
    expect(withPassengers(brennan, [{ name: "Brennan Direnfeld" }]).passenger).toBe("Brennan Direnfeld");
    expect(withPassengers(brennan, null)).toEqual(brennan);
  });
});
