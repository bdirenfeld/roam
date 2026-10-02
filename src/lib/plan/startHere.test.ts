import { describe, it, expect } from "vitest";
import { startSteps, type StartCard } from "./startHere";

/** A new journey's two ways to start: each goes on its own (1 Oct 2026). */

const hotel: StartCard = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "hotel" } };
const flight: StartCard = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "flight_arrival" } };
const car: StartCard = { day_id: "d2", status: "in_itinerary", details: { title: "Pick up rental car · Hertz", drop_off: "2027-09-04" }, place: { type: "logistics", sub_type: "transit" } };
const savedSight: StartCard = { day_id: null, status: "interested", place: { type: "activity", sub_type: "self_directed" } };
const plannedDinner: StartCard = { day_id: "d3", status: "in_itinerary", place: { type: "food", sub_type: "restaurant" } };
const note: StartCard = { day_id: "d1", status: "in_itinerary", details: { title: "Pack sunscreen" }, place: null };

describe("a new journey's two ways to start", () => {
  it("nothing on it: both", () => {
    expect(startSteps([])).toEqual({ upload: true, find: true });
  });
  it("a note is not a start: both still", () => {
    expect(startSteps([note])).toEqual({ upload: true, find: true });
  });
  it("the hotel uploaded: Find places stays (Brennan, 1 Oct 2026)", () => {
    expect(startSteps([hotel])).toEqual({ upload: false, find: true });
  });
  it("a flight, or a rental car, counts as a booking", () => {
    expect(startSteps([flight]).upload).toBe(false);
    expect(startSteps([car]).upload).toBe(false);
  });
  it("a place saved: Upload stays until a booking is on a day", () => {
    expect(startSteps([savedSight])).toEqual({ upload: true, find: false });
    expect(startSteps([plannedDinner]).find).toBe(false);
  });
  it("a hotel only saved as an idea is not a booking; a cut place is not a start", () => {
    expect(startSteps([{ ...hotel, day_id: null, status: "interested" }]).upload).toBe(true);
    expect(startSteps([{ ...savedSight, status: "cut" }]).find).toBe(true);
  });
  it("the phone's other days: no Upload a booking, Find places still (Brennan, 2 Oct 2026)", () => {
    expect(startSteps([], { firstDay: false })).toEqual({ upload: false, find: true });
    expect(startSteps([], { firstDay: true })).toEqual({ upload: true, find: true });
    expect(startSteps([hotel], { firstDay: true }).upload).toBe(false);
    expect(startSteps([savedSight], { firstDay: false })).toEqual({ upload: false, find: false });
  });
  it("both done: the card is gone", () => {
    expect(startSteps([hotel, savedSight])).toEqual({ upload: false, find: false });
  });
});
