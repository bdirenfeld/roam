import { describe, it, expect } from "vitest";
import { dayPinNumbers, pinOpacity, stayPlaceFor, MUTED_PIN_OPACITY, type FocusCard } from "./dayFocus";

const at = (lat: number, lng: number) => ({ lat, lng, sub_type: null });
const card = (id: string, day: string | null, start: string | null, position: number, over: Partial<FocusCard> = {}): FocusCard => ({
  id, day_id: day, status: day ? "in_itinerary" : "interested", start_time: start, end_time: null, position, place: at(43.77, 11.25), details: null, ...over,
} as FocusCard);

// Wednesday in Florence as the live journey has it: positions out of time order.
const wed = [
  card("girone", "wed", null, 1),
  card("buca", "wed", "19:00:00", 2),
  card("gelato", "wed", "20:30:00", 3),
  card("panetteria", "wed", null, 4),
];

describe("dayPinNumbers: the map numbers a day the way its list does", () => {
  it("timed stops first by the clock, untimed after by position", () => {
    const n = dayPinNumbers(wed, "wed");
    expect(Array.from(n.entries())).toEqual([["buca", 1], ["gelato", 2], ["girone", 3], ["panetteria", 4]]);
  });
  it("leaves out other days, saved places, archived cards and cards with no location", () => {
    const n = dayPinNumbers([
      ...wed,
      card("thu", "thu", "10:00:00", 1),
      card("saved", null, null, 0),
      card("gone", "wed", "08:00:00", 0, { archived: true }),
      card("nowhere", "wed", "07:00:00", 0, { place: { lat: null, lng: null, sub_type: null } }),
    ], "wed");
    expect(n.size).toBe(4);
    expect(n.get("buca")).toBe(1);
  });
  it("no day chosen: nothing numbered", () => {
    expect(dayPinNumbers(wed, null).size).toBe(0);
  });
});

describe("pinOpacity: the day stands out, the rest stays as context", () => {
  const n = dayPinNumbers(wed, "wed");
  it("the day's stops full, everything else muted to the desktop's strength", () => {
    expect(pinOpacity("buca", n, "wed")).toBe(1);
    expect(pinOpacity("thu", n, "wed")).toBe(MUTED_PIN_OPACITY);
    expect(MUTED_PIN_OPACITY).toBe(0.22);
  });
  it("the whole trip: nothing muted", () => {
    expect(pinOpacity("thu", new Map(), null)).toBe(1);
  });
});

describe("stayPlaceFor: the night's hotel comes with the day", () => {
  const days = [{ id: "d1", date: "2027-08-24" }, { id: "d2", date: "2027-08-25" }, { id: "d3", date: "2027-08-26" }];
  const villa = { id: "villa-in", day_id: "d1", place_id: "villa", status: "in_itinerary", start_time: "14:00:00", place: { sub_type: "hotel", title: "Villa Zambaldi" } };
  it("checked in on Tuesday, still there Wednesday and Thursday (Brennan's Sunday in Colonnata had no star)", () => {
    expect(stayPlaceFor([villa], days, "2027-09-04", "d1")).toBe("villa");
    expect(stayPlaceFor([villa], days, "2027-09-04", "d3")).toBe("villa");
  });
  it("no day chosen, or no hotel: nothing", () => {
    expect(stayPlaceFor([villa], days, "2027-09-04", null)).toBeNull();
    expect(stayPlaceFor([], days, "2027-09-04", "d2")).toBeNull();
  });
});
