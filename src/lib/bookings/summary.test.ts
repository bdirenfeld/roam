import { describe, it, expect } from "vitest";
import { bookingLines, isRentalCar, range, type BookingCard } from "./summary";

// Days and cards shaped as the database holds them (1 Oct 2026).
const daysFrom = (start: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, date: new Date(Date.parse(start + "T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10) }));
const card = (id: string, dayId: string, sub: string, title: string, extra: Partial<BookingCard> = {}): BookingCard =>
  ({ id, day_id: dayId, place_id: `p-${title}`, status: "in_itinerary", start_time: null, details: {}, place: { sub_type: sub, title, address: null }, ...extra });

describe("the Bookings row's lines", () => {
  it("Tuscany: there and back, one villa", () => {
    const days = daysFrom("2027-08-24", 12);
    const lines = bookingLines(days, [
      card("f1", "d0", "flight_arrival", "Pisa International Airport", { details: { arriving_at: "Pisa International Airport (PSA)" } }),
      card("v1", "d0", "hotel", "Villa Zambaldi", { start_time: "14:00:00" }),
      card("v2", "d11", "hotel", "Villa Zambaldi", { details: { title: "Check out of the villa" } }),
      card("f2", "d11", "flight_departure", "Pisa International Airport", { details: { arriving_at: "Toronto Pearson (YYZ)" } }),
    ], "2027-09-04");
    expect(lines).toEqual([
      { kind: "Flights", text: "Tue 24 Aug to Pisa · Sat 4 Sep to Toronto Pearson" },
      { kind: "Hotel", text: "Villa Zambaldi, 24 Aug – 4 Sep" },
    ]);
  });

  it("Rome: two hotels by name and nights", () => {
    const days = daysFrom("2026-04-22", 7);
    const lines = bookingLines(days, [
      card("a", "d0", "hotel", "NH Collection"),
      card("b", "d2", "hotel", "Banco 19 B&B", { details: { check_out: "2026-04-28" } }),
    ], "2026-04-28");
    expect(lines).toEqual([{ kind: "Hotels", text: "NH Collection, 22–24 Apr · Banco 19 B&B, 24–28 Apr" }]);
  });

  it("Europe: many flights as a count, many hotels as towns, and a car", () => {
    const days = daysFrom("2027-07-01", 61);
    const at = (d: string) => `d${Math.round((Date.parse(d + "T12:00:00Z") - Date.parse("2027-07-01T12:00:00Z")) / 86_400_000)}`;
    const lines = bookingLines(days, [
      card("f1", at("2027-07-01"), "flight_arrival", "Heathrow"),
      card("f2", at("2027-07-10"), "flight_arrival", "CDG"),
      card("f3", at("2027-08-10"), "flight_arrival", "El Prat"),
      card("f4", at("2027-08-30"), "flight_departure", "El Prat"),
      card("h1", at("2027-07-01"), "hotel", "Presidential Apartments", { place: { sub_type: "hotel", title: "Presidential Apartments", address: "Kensington, London, UK" } }),
      card("h2", at("2027-07-10"), "hotel", "Citadines", { place: { sub_type: "hotel", title: "Citadines", address: "Paris, France" } }),
      card("h3", at("2027-07-20"), "hotel", "Hotel Ilaria", { place: { sub_type: "hotel", title: "Hotel Ilaria", address: "Lucca, Italy" } }),
      card("h4", at("2027-08-10"), "hotel", "Lugaris Rambla", { place: { sub_type: "hotel", title: "Lugaris Rambla", address: "Barcelona, Spain" } }),
      card("c1", at("2027-07-20"), "transit", "Hertz Pisa", { details: { title: "Pick up rental car · Hertz · Pisa Airport", drop_off: "2027-08-10" } }),
    ], "2027-08-30");
    expect(lines).toEqual([
      { kind: "Flights", text: "4, 1 Jul – 30 Aug" },
      { kind: "Hotels", text: "4: London, Paris, Lucca, Barcelona" },
      { kind: "Car", text: "Hertz · Pisa Airport, 20 Jul – 10 Aug" },
    ]);
  });

  it("nothing booked is no lines; saved ideas and cut cards are not bookings", () => {
    const days = daysFrom("2028-04-02", 14);
    expect(bookingLines(days, [card("x", "d0", "hotel", "Takefue", { status: "interested" }), card("y", "d0", "flight_arrival", "HND", { status: "cut" })], "2028-04-15")).toEqual([]);
  });

  it("ranges read in one month or across two", () => {
    expect(range("2026-04-22", "2026-04-24")).toBe("22–24 Apr");
    expect(range("2027-08-24", "2027-09-04")).toBe("24 Aug – 4 Sep");
  });
});

describe("isRentalCar (shared with the To book checklist)", () => {
  it("is the reader's pick-up card: a drop-off date, or the 'Pick up rental car' title", () => {
    expect(isRentalCar({ details: { drop_off: "2027-09-04" } })).toBe(true);
    expect(isRentalCar({ details: { title: "Pick up rental car · Hertz" } })).toBe(true);
    expect(isRentalCar({ details: { title: "Return the rental car" } })).toBe(false);
    expect(isRentalCar({ details: null })).toBe(false);
  });
});
