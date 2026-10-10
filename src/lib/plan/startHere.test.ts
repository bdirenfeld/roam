import { describe, it, expect } from "vitest";
import { startSteps, type StartCard } from "./startHere";
import japan from "./fixtures/japan-start.json";

/** A new journey's two ways to start: each goes on its own (1 Oct 2026). */

const hotel: StartCard = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "hotel" } };
const flight: StartCard = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "flight_arrival" } };
const car: StartCard = { day_id: "d2", status: "in_itinerary", details: { title: "Pick up rental car · Hertz", drop_off: "2027-09-04" }, place: { type: "logistics", sub_type: "transit" } };
const savedSight: StartCard = { day_id: null, status: "interested", place: { type: "activity", sub_type: "self_directed" } };
const plannedDinner: StartCard = { day_id: "d3", status: "in_itinerary", place: { type: "food", sub_type: "restaurant" } };
const note: StartCard = { day_id: "d1", status: "in_itinerary", details: { title: "Pack sunscreen" }, place: null };

describe("a new journey's two ways to start", () => {
  it("nothing on it: both", () => {
    expect(startSteps([])).toEqual({ upload: true, find: true, plan: false });
  });
  it("a note is not a start: both still", () => {
    expect(startSteps([note])).toEqual({ upload: true, find: true, plan: false });
  });
  it("the hotel uploaded: Find places stays (Brennan, 1 Oct 2026)", () => {
    expect(startSteps([hotel])).toEqual({ upload: false, find: true, plan: false });
  });
  it("a flight, or a rental car, counts as a booking", () => {
    expect(startSteps([flight]).upload).toBe(false);
    expect(startSteps([car]).upload).toBe(false);
  });
  it("a place only saved: Upload stays until a booking is on a day", () => {
    expect(startSteps([savedSight])).toEqual({ upload: true, find: false, plan: true });
  });
  it("a hotel only saved as an idea is not a booking; a cut place is not a start", () => {
    expect(startSteps([{ ...hotel, day_id: null, status: "interested" }]).upload).toBe(true);
    expect(startSteps([{ ...savedSight, status: "cut" }]).find).toBe(true);
  });
  it("the phone's other days: no Upload a booking, Find places still (Brennan, 2 Oct 2026)", () => {
    expect(startSteps([], { firstDay: false })).toEqual({ upload: false, find: true, plan: false });
    expect(startSteps([], { firstDay: true })).toEqual({ upload: true, find: true, plan: false });
    expect(startSteps([hotel], { firstDay: true }).upload).toBe(false);
    expect(startSteps([savedSight], { firstDay: false })).toEqual({ upload: false, find: false, plan: true });
  });
  it("a stop planned on a day: the whole card is gone, booking or not (Brennan, 2 Oct 2026)", () => {
    expect(startSteps([plannedDinner])).toEqual({ upload: false, find: false, plan: false });
    expect(startSteps([plannedDinner], { firstDay: true })).toEqual({ upload: false, find: false, plan: false });
    // A place on a day but still only "interested", or cut, is not a planned stop.
    expect(startSteps([{ ...plannedDinner, status: "interested" }]).upload).toBe(true);
    expect(startSteps([{ ...plannedDinner, status: "cut" }]).upload).toBe(true);
    // A note on a day is not a stop either.
    expect(startSteps([note]).upload).toBe(true);
  });
  it("his Japan journey as stored: 94 cards, 46 planned, hotels only 'interested': no Start here on day 1 or the week", () => {
    const cards = japan.cards as StartCard[];
    expect(cards).toHaveLength(94);
    expect(cards.filter((c) => c.day_id && c.status === "in_itinerary")).toHaveLength(46);
    expect(startSteps(cards, { firstDay: true })).toEqual({ upload: false, find: false, plan: false });
    expect(startSteps(cards)).toEqual({ upload: false, find: false, plan: false });
  });
  it("both done, nothing planned: Plan my trip is the row left (10 Oct 2026)", () => {
    expect(startSteps([hotel, savedSight])).toEqual({ upload: false, find: false, plan: true });
  });
  it("Plan my trip needs something saved and nothing planned: never on an empty journey", () => {
    expect(startSteps([]).plan).toBe(false);
    expect(startSteps([hotel]).plan).toBe(false);
    expect(startSteps([savedSight, plannedDinner]).plan).toBe(false);
    expect(startSteps([{ ...savedSight, status: "cut" }]).plan).toBe(false);
  });
});
