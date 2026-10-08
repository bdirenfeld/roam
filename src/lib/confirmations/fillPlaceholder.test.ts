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
