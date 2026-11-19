import { describe, it, expect } from "vitest";
import { existingFor, fillFrom, type DayCard } from "./fillPlaceholder";

/** Placeholders from a copied journey become the booked cards (7 Oct 2026). */

const lga = (o: Partial<DayCard>): DayCard => ({
  id: "c", place_id: "lga", status: "in_itinerary", confirmed: false, start_time: "09:20:00", end_time: null,
  details: { title: "LaGuardia", to_book: true }, place: { sub_type: "flight_arrival", google_place_id: "gLGA" }, ...o,
});
const upload = { place_id: "lga2", start_time: "10:05:00", end_time: "12:40:00", details: { title: "AC 704", flight_number: "AC704", seat: "3A", confirmation: "B24", paid_total: 0 }, place: { sub_type: "flight_arrival", google_place_id: "gLGA" } };

describe("existingFor", () => {
  it("matches the same airport by Google id even when the place row differs, and prefers the same kind", () => {
    const leaving = lga({ id: "out", place: { sub_type: "flight_departure", google_place_id: "gLGA" } });
    const arriving = lga({ id: "in" });
    expect(existingFor(upload, "flight_arrival", [leaving, arriving])?.id).toBe("in");
  });
  it("never a cut or saved card, never a note", () => {
    expect(existingFor(upload, "flight_arrival", [lga({ status: "interested" })])).toBeNull();
    expect(existingFor({ ...upload, place_id: null }, "flight_arrival", [lga({})])).toBeNull();
  });
});

describe("fillFrom", () => {
  it("a placeholder takes times and booking details and loses to_book", () => {
    const { patch } = fillFrom(lga({}), upload);
    expect(patch).toEqual({ confirmed: true, start_time: "10:05:00", end_time: "12:40:00", details: { title: "LaGuardia", flight_number: "AC704", seat: "3A", confirmation: "B24", paid_total: 0 } });
  });
  it("a booked card only gets a missing time", () => {
    expect(fillFrom(lga({ confirmed: true }), upload).patch).toEqual({ confirmed: true, start_time: "09:20:00", end_time: "12:40:00" });
  });
});

describe("a rental car placeholder takes the booking (19 Nov 2026)", () => {
  // The Tuscany van placeholder on Wed 25 Aug; the booking resolves to Hertz's desk at Pisa.
  const van: DayCard = { id: "v1", place_id: "generic", status: "in_itinerary", confirmed: false, start_time: "12:30:00", end_time: null,
    details: { title: "Pick up rental van", car_class: "Van for 5 + luggage", drop_off: "2027-09-05" }, place: { sub_type: "car_rental", google_place_id: "g-generic" } };
  const booking = { place_id: "hertz", start_time: "13:00:00", end_time: null, place: { sub_type: "car_rental", google_place_id: "g-hertz" },
    details: { title: "Pick up rental car · Hertz · Pisa Airport", company: "Hertz", confirmation: "H123", car_class: "Ford Transit Custom · manual", fuel_policy: "Full to full", paid_total: 612.4, paid_currency: "EUR" } };

  it("a different desk that day still finds the van placeholder", () => {
    expect(existingFor(booking, "car_rental", [van])?.id).toBe("v1");
  });

  it("…and takes the company, confirmation, car, fuel, price, time and the booked desk; the van's own title stays", () => {
    const { patch, card } = fillFrom(van, booking);
    const d = patch.details as Record<string, unknown>;
    expect([patch.confirmed, patch.start_time, patch.place_id]).toEqual([true, "13:00:00", "hertz"]);
    expect([d.company, d.confirmation, d.car_class, d.fuel_policy, d.paid_total, d.title]).toEqual(["Hertz", "H123", "Ford Transit Custom · manual", "Full to full", 612.4, "Pick up rental van"]);
    expect(card.place?.google_place_id).toBe("g-hertz");
  });

  it("a booked rental is never taken over, and a hotel booking never lands on the van", () => {
    expect(existingFor(booking, "car_rental", [{ ...van, confirmed: true }])).toBeNull();
    expect(existingFor({ ...booking, place: { sub_type: "hotel" } }, "hotel", [van])).toBeNull();
  });
});
