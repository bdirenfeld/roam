import { describe, it, expect } from "vitest";
import { confirmationDetails, closingDetails, onePricePerBooking, paidAmount, placeQuery, placeSubType, checkOutTime, closingEvent, openingTitle, type ParsedConfirmation } from "./toCards";
import { CONFIRMATION_PROMPT, extractBookings } from "./prompt";

// Shaped like the reader's answers for his Rome bookings (Air Canada AC890, Banco 19).
const flight: ParsedConfirmation = {
  type: "flight_arrival", title: "Air Canada · YYZ → FCO", confirmation_number: "B24EDV", date: "2026-04-22", time: "19:45", end_time: "10:20",
  address: "Leonardo da Vinci–Fiumicino Airport, Rome", phone: null, website: "https://aircanada.com", notes: "Economy, 9h 35m",
  airline: "Air Canada", flight_number: "AC 890", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Rome Fiumicino (FCO)", seat: "32A",
};
const hotel: ParsedConfirmation = {
  type: "hotel", title: "Banco 19 B&B", confirmation_number: "73354827426245", date: "2026-04-24", time: "14:00", end_time: null,
  address: "Via dei Banchi Nuovi 19, Rome", phone: "+39 339 278 0558", website: null, notes: null,
  check_out_date: "2026-04-28", check_out_time: "10:30",
};
const edits = (p: ParsedConfirmation) => ({ title: p.title, notes: p.notes ?? "", confirmation: p.confirmation_number ?? "" });

describe("a rental car in a package is a pick-up and a drop-off", () => {
  const car: ParsedConfirmation = {
    type: "car_rental", title: "Hertz · Pisa Airport", confirmation_number: "H1", date: "2027-08-24", time: "11:30", end_time: null,
    address: "Pisa International Airport", phone: null, website: null, notes: null, drop_off_date: "2027-09-04", drop_off_time: "08:00", drop_off_location: null,
  };
  it("is saved as a transit stop at the pick-up desk", () => {
    expect(placeSubType("car_rental")).toEqual({ type: "logistics", sub_type: "transit" });
    expect(placeQuery(car)).toBe("Pisa International Airport");
  });
  it("opens as the pick-up and closes on the drop-off day", () => {
    expect(openingTitle(car, car.title)).toBe("Pick up rental car · Hertz · Pisa Airport");
    expect(closingEvent(car, "Pisa Airport")).toEqual({ date: "2027-09-04", time: "08:00:00", title: "Return the rental car" });
    expect(closingEvent({ ...car, drop_off_location: "Florence" }, "x")?.title).toBe("Return the rental car · Florence");
    expect(confirmationDetails(car, { title: car.title, notes: "", confirmation: "H1" }).drop_off).toBe("2027-09-04");
  });
  it("a hotel closes with its check-out; a flight has no second event", () => {
    expect(closingEvent(hotel, "Banco 19")).toEqual({ date: "2026-04-28", time: "10:30:00", title: "Check out of Banco 19" });
    expect(closingEvent(flight, "FCO")).toBeNull();
  });
});

describe("an uploaded confirmation fills the card as a hand-made one", () => {
  it("a flight's number, airline, airports and seat each have their own line", () => {
    expect(confirmationDetails(flight, edits(flight))).toEqual({
      title: "Air Canada · YYZ → FCO", confirmation: "B24EDV", website: "https://aircanada.com", notes: "Economy, 9h 35m",
      airline: "Air Canada", flight_number: "AC890", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Rome Fiumicino (FCO)", seat: "32A",
    });
  });

  it("a hotel carries its check-out, so it covers its nights", () => {
    const d = confirmationDetails(hotel, edits(hotel));
    expect(d.check_out).toBe("2026-04-28");
    expect(d.flight_number).toBeUndefined();
    expect(checkOutTime(hotel)).toBe("10:30:00");
    expect(checkOutTime({ ...hotel, check_out_time: null })).toBe("11:00:00");
  });

  it("ignores a check-out that is not a date", () => {
    expect(confirmationDetails({ ...hotel, check_out_date: "Tue, Apr 28" }, edits(hotel)).check_out).toBeUndefined();
  });

  it("looks the hotel up by name and address, a flight by its airport", () => {
    expect(placeQuery(hotel)).toBe("Banco 19 B&B, Via dei Banchi Nuovi 19, Rome");
    expect(placeQuery(flight)).toBe("Leonardo da Vinci–Fiumicino Airport, Rome");
    expect(placeQuery({ ...flight, address: null })).toBeNull();
  });

  it("saves each as the kind the map would", () => {
    expect(placeSubType("hotel")).toEqual({ type: "logistics", sub_type: "hotel" });
    expect(placeSubType("flight_departure")).toEqual({ type: "logistics", sub_type: "flight_departure" });
    expect(placeSubType("restaurant")).toEqual({ type: "food", sub_type: "restaurant" });
  });
});

describe("what a booking cost (6 Oct 2026): once per booking, on the opening card", () => {
  // Rome's real AC890 round trip: two legs under one reference, B24EDV.
  const back: ParsedConfirmation = { ...flight, type: "flight_departure", title: "Air Canada · FCO → YYZ", date: "2026-04-28", time: "12:25", end_time: "16:00", origin_airport: "Rome Fiumicino (FCO)", arriving_at: "Toronto Pearson (YYZ)" };

  it("a flight, hotel or car keeps its price and currency on the card", () => {
    expect(confirmationDetails({ ...flight, total_paid: 2140.6, paid_currency: "cad" }, edits(flight))).toMatchObject({ paid_total: 2140.6, paid_currency: "CAD" });
    expect(confirmationDetails({ ...hotel, total_paid: "1,180.00", paid_currency: "EUR" }, edits(hotel))).toMatchObject({ paid_total: 1180, paid_currency: "EUR" });
  });
  it("no price, no currency, or a restaurant: nothing is written", () => {
    expect(confirmationDetails({ ...hotel, total_paid: null, paid_currency: "EUR" }, edits(hotel)).paid_total).toBeUndefined();
    expect(confirmationDetails({ ...hotel, total_paid: 500, paid_currency: null }, edits(hotel)).paid_total).toBeUndefined();
    expect(confirmationDetails({ ...hotel, type: "restaurant", total_paid: 90, paid_currency: "EUR" }, edits(hotel)).paid_total).toBeUndefined();
    expect(paidAmount("TBD")).toBeNull();
    expect(paidAmount(0)).toBeNull();
  });
  it("a round trip read with the price on both legs is counted once, on the outbound", () => {
    const out = onePricePerBooking([{ ...flight, total_paid: 2140.6, paid_currency: "CAD" }, { ...back, total_paid: 2140.6, paid_currency: "CAD" }, { ...hotel, total_paid: 1180, paid_currency: "EUR" }]);
    expect(out.map((b) => b.total_paid)).toEqual([2140.6, null, 1180]);
  });
  it("two bookings that happen to cost the same, under different references, keep both", () => {
    const out = onePricePerBooking([{ ...hotel, total_paid: 400, paid_currency: "EUR" }, { ...hotel, confirmation_number: "OTHER", total_paid: 400, paid_currency: "EUR" }]);
    expect(out.map((b) => b.total_paid)).toEqual([400, 400]);
  });
  it("the check-out and drop-off cards never carry the price", () => {
    const d = confirmationDetails({ ...hotel, total_paid: 1180, paid_currency: "EUR" }, edits(hotel));
    expect(closingDetails(d, "Check out of Banco 19")).toEqual({ ...d, title: "Check out of Banco 19", paid_total: undefined, paid_currency: undefined });
    expect(Object.keys(closingDetails(d, "x"))).not.toContain("paid_total");
    expect(closingDetails(null, "x")).toEqual({ title: "x" });
  });
  it("the reader is asked for it, once per booking", () => {
    expect(CONFIRMATION_PROMPT).toMatch(/"total_paid"/);
    expect(CONFIRMATION_PROMPT).toMatch(/ONE object only/);
    expect(extractBookings(JSON.stringify([{ ...flight, total_paid: 900, paid_currency: "CAD" }, { ...back, total_paid: 900, paid_currency: "CAD" }])).map((b) => b.total_paid)).toEqual([900, null]);
  });
});
