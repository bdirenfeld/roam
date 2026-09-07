import { describe, it, expect } from "vitest";
import { cardTimes } from "./cardTime";
import type { Card, CardDetails, Place } from "@/types/database";

/**
 * Every row below is a real card, copied out of the live database on
 * 2026-09-07 — same sub_type, same start_time and end_time, same
 * `details.departure_time`. Nothing here is invented, because the bug this
 * function exists to fix was caused by assuming all flights are stored the
 * same way, and they are not: Australia and Costa Rica hold the LANDING in
 * start_time, Rome and New York hold the DEPARTURE. A fixture written from
 * the shape one expects would have agreed with the broken code.
 *
 * The twelve flight cards in the database cover all six branches between them.
 */

function flightCard(
  subType: string | null,
  start: string | null,
  end: string | null,
  details: Record<string, unknown> = {},
): Card {
  const place = { sub_type: subType } as unknown as Place;
  return {
    id: "c", day_id: "d", trip_id: "t", list_id: null,
    start_time: start, end_time: end,
    position: 1, status: "in_itinerary", source_url: null,
    details: details as CardDetails,
    ai_generated: false, confirmed: false,
    created_at: "2026-01-01T00:00:00Z",
    place_id: "p", place: subType === null ? null : place,
  };
}

describe("cardTimes — flights stored departure-first", () => {
  // The card that named the bug. Rome day 1 showed "7:45 PM" for an overnight
  // flight, which sorted it to the bottom of the day it lands on.
  it("shows the landing time for the Rome overnight, not the pushback", () => {
    const rome = flightCard("flight_arrival", "19:45:00", "10:20:00", {
      departure_time: "19:45",
      arrival_time: "10:20+1day",
    });
    expect(cardTimes(rome)).toEqual({ start: "10:20:00", end: null });
  });

  it("collapses to a single time, never a range", () => {
    // A start..end range reads as a four-hour event sitting in the day.
    const nyOutbound = flightCard("flight_arrival", "09:20:00", "10:55:00", {
      departure_time: "09:20",
    });
    expect(cardTimes(nyOutbound).end).toBeNull();
  });

  it("handles Palm Springs the same way", () => {
    const ps = flightCard("flight_arrival", "09:00:00", "11:32:00", {
      departure_time: "09:00",
    });
    expect(cardTimes(ps)).toEqual({ start: "11:32:00", end: null });
  });
});

describe("cardTimes — flights already stored landing-first", () => {
  // These have no departure_time at all and already read correctly. Rewriting
  // them would move a time that was right.
  it.each([
    ["Australia · Sydney", "07:00:00", "09:30:00"],
    ["Costa Rica · Liberia", "14:23:00", "15:45:00"],
  ])("leaves %s untouched", (_name, start, end) => {
    const card = flightCard("flight_arrival", start, end);
    expect(cardTimes(card)).toEqual({ start, end });
  });
});

describe("cardTimes — the cases that must NOT be rewritten", () => {
  /**
   * The New York flight home stores start_time 16:00 and departure_time
   * "4:00", meaning 4 PM. Matching loosely — stripping the leading zero, or
   * comparing hours numerically — makes "4:00" equal "16:00" and moves a
   * departure that was already correct. The equality test is deliberately
   * strict for exactly this row, so it is worth a test of its own.
   */
  it("does not treat 12-hour '4:00' as matching a 16:00 start", () => {
    const nyHome = flightCard("flight_arrival", "16:00:00", "17:47:00", {
      departure_time: "4:00",
      arrival_time: "5:47",
    });
    expect(cardTimes(nyHome)).toEqual({ start: "16:00:00", end: "17:47:00" });
  });

  it("ignores a departure_time that is not a clock time", () => {
    // Palm Springs' second flight really does say this.
    const tbd = flightCard("flight_arrival", "12:30:00", "14:00:00", {
      departure_time: "TBD, around midday",
    });
    expect(cardTimes(tbd)).toEqual({ start: "12:30:00", end: "14:00:00" });
  });

  it("leaves a departing flight alone even when the times line up", () => {
    // Rome's flight home: sub_type is flight_departure, and departure_time
    // equals start_time. Only arrivals are rewritten.
    const home = flightCard("flight_departure", "12:25:00", "16:00:00", {
      departure_time: "12:25",
    });
    expect(cardTimes(home)).toEqual({ start: "12:25:00", end: "16:00:00" });
  });

  it("leaves a flight with no times alone", () => {
    // Santa Barbara's flights are booked but not yet timed.
    const untimed = flightCard("flight_arrival", null, null, { departure_time: "TBD" });
    expect(cardTimes(untimed)).toEqual({ start: null, end: null });
  });

  it("leaves a flight with a start but no end alone", () => {
    // Needs both to know which is the landing.
    const oneSided = flightCard("flight_arrival", "14:00:00", null);
    expect(cardTimes(oneSided)).toEqual({ start: "14:00:00", end: null });
  });

  it("leaves an ordinary card alone", () => {
    const dinner = flightCard("restaurant", "20:00:00", "22:00:00", {
      departure_time: "20:00",
    });
    expect(cardTimes(dinner)).toEqual({ start: "20:00:00", end: "22:00:00" });
  });

  it("leaves a note card with no place alone", () => {
    const note = flightCard(null, "09:00:00", null, { title: "Leave the villa" });
    expect(cardTimes(note)).toEqual({ start: "09:00:00", end: null });
  });
});
