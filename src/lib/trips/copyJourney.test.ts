import { describe, it, expect } from "vitest";
import { agesOn, copyJourney, copyDetails, copyCaption, copiedMessage, endFor, isSavedPlace, isToBook, journeyLength, suggestStart, weekdayOf, type CopyCardRow, type CopyDayRow, type CopyTripRow } from "./copyJourney";

/**
 * Copy to new dates (7 Oct 2026, mock t07). The rows are shaped like the live
 * tables: a New York-style long weekend with a flight in, a hotel with a
 * stored check-out, a dinner that was booked, a saved place, a cut one.
 */

const trip: CopyTripRow = {
  id: "ny", user_id: "me", title: "New York (Mia & Daddy)", destination: "New York, NY, USA",
  destination_lat: 40.71, destination_lng: -74.0, start_date: "2026-07-23", end_date: "2026-07-26",
  cruise: false, party_size: 2, party_ages: [42, 7], cover_image_url: "https://x/cover.jpg", notes: "## Packing",
  stay_nights: null,
};
const days: CopyDayRow[] = [
  { id: "d1", date: "2026-07-23", day_number: 1, theme: "Arrive and SoHo", day_name: null },
  { id: "d2", date: "2026-07-24", day_number: 2, theme: "Day 2", day_name: null },
  { id: "d3", date: "2026-07-25", day_number: 3, theme: null, day_name: "Museums" },
  { id: "d4", date: "2026-07-26", day_number: 4, theme: null, day_name: null },
];
const card = (id: string, o: Partial<CopyCardRow>): CopyCardRow => ({
  id, day_id: "d1", status: "in_itinerary", archived: false, place_id: `p-${id}`, start_time: null, end_time: null,
  position: 1, details: {}, confirmed: false, place: { sub_type: "restaurant" }, ...o,
});
const cards: CopyCardRow[] = [
  card("flight", {
    place_id: "lga", start_time: "09:20:00", position: 1, confirmed: true, place: { sub_type: "flight_arrival" },
    details: { title: "LaGuardia Airport", airline: "Air Canada", flight_number: "AC704", arriving_at: "LGA", confirmation: "B24EDV", seat: "14C", paid_total: 812.4, paid_currency: "CAD", notes: "Taxi rank on level 1" },
  }),
  card("hotel", {
    place_id: "howard", start_time: "15:00:00", position: 2, confirmed: true, place: { sub_type: "hotel" },
    details: { title: "11 Howard", check_out: "2026-07-26", confirmation: "H-99", paid_total: 2100, paid_currency: "USD" },
  }),
  card("checkout", { day_id: "d4", place_id: "howard", start_time: "11:00:00", place: { sub_type: "hotel" }, details: { title: "Check out of 11 Howard", check_out: "2026-07-26" } }),
  card("dinner", { day_id: "d2", start_time: "19:30:00", confirmed: true, details: { notes: "Ask for the garden" } }),
  card("museum", {
    day_id: "d3", position: 4, place: { sub_type: "museum" },
    details: { cost_per_person: 30, budget: { amount: 30 }, cost_source: { kind: "found", url: "https://x" }, schedule: [{ time: "10:00" }] },
  }),
  card("leg", { day_id: "d3", place_id: "penn", place: { sub_type: "transit" }, details: { mode: "train", from: { title: "Hudson Yards", lat: 40.75, lng: -74.0 } } }),
  card("note", { day_id: "d2", place_id: null, place: null, details: { notes: "Pack a jacket" } }),
  card("saved", { day_id: null, status: "interested" }),
  card("saved-list-note", { day_id: null, status: "interested", place_id: null, place: null }),
  card("cut", { status: "cut" }),
  card("archived", { archived: true }),
];

let n = 0;
const ids = () => `new-${++n}`;
const run = (o: Partial<Parameters<typeof copyJourney>[1]> = {}) => {
  n = 0;
  return copyJourney({ trip, days, cards }, { userId: "me", title: "New York (Bodhi & Daddy)", startDate: "2027-07-22", partySize: 3, partyAges: [43, 8, 5], includeSaved: true, newId: ids, ...o });
};
const byOld = (r: ReturnType<typeof run>, oldId: string) => {
  const i = cards.filter((c) => !c.archived && c.status !== "cut").findIndex((c) => c.id === oldId);
  return r.cards[i];
};

describe("copyJourney: the journey", () => {
  it("is new, mine, with the new title, dates and party; carries destination, cover and notes; no share link, ticks empty", () => {
    const r = run();
    expect(r.trip).toMatchObject({
      user_id: "me", title: "New York (Bodhi & Daddy)", start_date: "2027-07-22", end_date: "2027-07-25",
      destination: "New York, NY, USA", destination_lat: 40.71, cover_image_url: "https://x/cover.jpg", cruise: false,
      party_size: 3, party_ages: [43, 8, 5], booking_checklist: {}, archived: false, status: "planning", notes: "## Packing",
    });
    expect(r.trip.id).not.toBe("ny");
    expect(r.trip).not.toHaveProperty("share_token");
  });

  it("lays the same number of days on the new dates, day_number by position, typed names carried, 'Day 2' not", () => {
    const r = run();
    expect(r.days.map((d) => [d.date, d.day_number])).toEqual([["2027-07-22", 1], ["2027-07-23", 2], ["2027-07-24", 3], ["2027-07-25", 4]]);
    expect(r.days[0].theme).toBe("Arrive and SoHo");
    expect(r.days[1].theme).toBeUndefined();
    expect(r.days[2].day_name).toBe("Museums");
    expect(r.days.every((d) => d.trip_id === r.trip.id)).toBe(true);
  });

  it("keeps every day across a spring clock change (Mar 14 2027)", () => {
    n = 0;
    const r = copyJourney(
      { trip: { ...trip, start_date: "2026-03-05", end_date: "2026-03-09" }, days: ["05", "06", "07", "08", "09"].map((d, i) => ({ id: `m${i}`, date: `2026-03-${d}`, theme: `T${i + 1}` })), cards: [card("x", { day_id: "m4" })] },
      { userId: "me", title: "Again", startDate: "2027-03-12", partySize: 2, partyAges: null, includeSaved: false, newId: ids },
    );
    expect(r.days.map((d) => d.date)).toEqual(["2027-03-12", "2027-03-13", "2027-03-14", "2027-03-15", "2027-03-16"]);
    expect(r.days.map((d) => d.theme)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(r.cards[0].day_id).toBe(r.days[4].id);
  });
});

describe("copyJourney: the cards", () => {
  it("puts each planned card on the same day number with its place, times, position and notes", () => {
    const r = run();
    const dinner = byOld(r, "dinner");
    expect(dinner).toMatchObject({ day_id: r.days[1].id, place_id: "p-dinner", start_time: "19:30:00", position: 1, status: "in_itinerary" });
    expect((dinner.details as Record<string, unknown>).notes).toBe("Ask for the garden");
    expect(byOld(r, "note").place_id).toBeNull();
    expect(byOld(r, "leg").details).toMatchObject({ mode: "train", from: { title: "Hudson Yards" } });
    expect(byOld(r, "museum").details).toMatchObject({ schedule: [{ time: "10:00" }] });
  });

  it("strips what belonged to the old booking and marks it to book again", () => {
    const r = run();
    const flight = byOld(r, "flight");
    expect(flight.confirmed).toBe(false);
    expect(flight.details).toEqual({ title: "LaGuardia Airport", airline: "Air Canada", arriving_at: "LGA", notes: "Taxi rank on level 1", to_book: true });
    const hotel = byOld(r, "hotel");
    expect(hotel.details).toEqual({ title: "11 Howard", check_out: "2027-07-25", to_book: true });
    expect(byOld(r, "checkout").details).toMatchObject({ check_out: "2027-07-25", to_book: true });
    expect(byOld(r, "dinner").details).toMatchObject({ to_book: true });
    // A price found online last year is not carried; a museum was never a booking.
    expect(byOld(r, "museum").details).toEqual({ schedule: [{ time: "10:00" }] });
    expect(r.cards.every((c) => c.confirmed === false && c.list_id === null)).toBe(true);
  });

  it("brings saved places only when the switch is on; never cut, archived, or a saved note", () => {
    const on = run();
    expect(on.cards.filter((c) => c.status === "interested").map((c) => c.place_id)).toEqual(["p-saved"]);
    const off = run({ includeSaved: false });
    expect(off.cards.some((c) => c.status === "interested")).toBe(false);
    expect(on.cards.some((c) => c.place_id === "p-cut" || c.place_id === "p-archived")).toBe(false);
    expect(on.cards.filter((c) => c.status === "in_itinerary")).toHaveLength(7);
  });

  it("counts days and distinct planned places for the toast", () => {
    expect(run().counts).toEqual({ days: 4, places: 5 });
    expect(copiedMessage({ days: 4, places: 19 })).toBe("Copied · 4 days, 19 places");
    expect(copiedMessage({ days: 1, places: 0 })).toBe("Copied · 1 day");
  });
});

describe("copyJourney helpers", () => {
  it("copyDetails moves a drop-off with the journey and leaves the input alone", () => {
    const d = { drop_off: "2026-07-26", confirmation: "X" };
    expect(copyDetails(d, 364)).toEqual({ drop_off: "2027-07-25" });
    expect(d.confirmation).toBe("X");
  });
  it("isToBook: a placeholder until booked", () => {
    expect(isToBook({ details: { to_book: true }, confirmed: false })).toBe(true);
    expect(isToBook({ details: { to_book: true }, confirmed: true })).toBe(false);
    expect(isToBook({ details: {} })).toBe(false);
  });
  it("isSavedPlace", () => {
    expect(isSavedPlace({ status: "interested", archived: false, place_id: "p" })).toBe(true);
    expect(isSavedPlace({ status: "interested", archived: true, place_id: "p" })).toBe(false);
    expect(isSavedPlace({ status: "in_itinerary", archived: false, place_id: "p" })).toBe(false);
  });
  it("dates, caption and weekday", () => {
    expect(journeyLength("2026-07-23", "2026-07-26")).toBe(4);
    expect(endFor("2027-07-22", 4)).toBe("2027-07-25");
    expect(copyCaption("2027-07-22", 4)).toBe("4 days · Thu 22 Jul – Sun 25 Jul 2027");
    expect(copyCaption("2027-12-30", 4)).toBe("4 days · Thu 30 Dec 2027 – Sun 2 Jan 2028");
    expect(weekdayOf("2026-07-23")).toBe("Thursday");
    expect(suggestStart("2026-07-23", "2026-10-07")).toBe("2027-07-22");
    expect(suggestStart("2024-07-25", "2026-10-07")).toBe("2027-07-22");
  });
  it("agesOn: 52 weeks on is a year older; a few weeks is not", () => {
    expect(agesOn([42, 7], "2026-07-23", "2027-07-22")).toEqual([43, 8]);
    expect(agesOn([42, 7], "2026-07-23", "2026-09-01")).toEqual([42, 7]);
    expect(agesOn(null, "2026-07-23", "2027-07-22")).toBeNull();
  });
});
