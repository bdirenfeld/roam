import { describe, it, expect } from "vitest";
import { stopExtras, tonightByDay, guestSafeCover } from "./sharedItinerary";

// Field shapes and values below are the real ones on Brennan's cards
// (queried 23 Sep 2026): what_to_bring is an array, the rest are strings, and
// "TBD" is what an unfilled confirmation looks like.
describe("stopExtras", () => {
  it("shows the meeting point and time together", () => {
    expect(
      stopExtras({
        meeting_point: "Rose Center for Earth and Space entrance, 81st Street between Central Park West and Columbus Avenue",
        meeting_time: "5:20",
      }),
    ).toEqual([
      { label: "Meet", text: "5:20 · Rose Center for Earth and Space entrance, 81st Street between Central Park West and Columbus Avenue" },
    ]);
  });

  it("joins a what-to-bring list", () => {
    expect(
      stopExtras({ what_to_bring: ["The wagon or stroller — the grounds are big and Bodhi will not walk them", "Five refillable water bottles", "Sunscreen"] }),
    ).toEqual([
      { label: "Bring", text: "The wagon or stroller — the grounds are big and Bodhi will not walk them, Five refillable water bottles, Sunscreen" },
    ]);
  });

  it("shows prep and hotel times", () => {
    expect(stopExtras({ prep: "Swimsuits, sunscreen, towels, sunglasses, water", check_in_time: "2:00 PM", check_out_time: "10:30 AM" })).toEqual([
      { label: "Before you go", text: "Swimsuits, sunscreen, towels, sunglasses, water" },
      { label: "Check-in", text: "from 2:00 PM · out by 10:30 AM" },
    ]);
  });

  it("never shows a confirmation number, and drops blanks and TBD", () => {
    expect(stopExtras({ confirmation: "ABC123", meeting_point: "TBD", prep: "  ", what_to_bring: [] })).toEqual([]);
    expect(stopExtras(null)).toEqual([]);
  });
});

describe("tonightByDay", () => {
  // Costa Rica: the Casita checked in on day 1 and out on day 9 (of 9).
  const cr = Array.from({ length: 9 }, (_, i) => ({ id: `cr${i + 1}`, dayNumber: i + 1 }));
  const casita = { name: "Modern Casita", address: "Playa Langosta" };

  it("carries the hotel forward and drops it on the last day", () => {
    const m = tonightByDay(cr, [{ dayId: "cr1", ...casita }, { dayId: "cr9", ...casita }], null);
    expect(m.get("cr1")).toEqual(casita);
    expect(m.get("cr5")).toEqual(casita);
    expect(m.get("cr9")).toBeNull();
  });

  it("switches hotels on the day of the move (Rome: NH days 1–2, Banco 19 from day 3)", () => {
    const rome = Array.from({ length: 7 }, (_, i) => ({ id: `r${i + 1}`, dayNumber: i + 1 }));
    const nh = { name: "Hotel NH Collection Roma Palazzo Cinquecento", address: null };
    const banco = { name: "Banco 19 B&B", address: null };
    const m = tonightByDay(rome, [{ dayId: "r3", ...banco }, { dayId: "r1", ...nh }], null);
    expect(m.get("r2")).toEqual(nh);
    expect(m.get("r3")).toEqual(banco);
    expect(m.get("r6")).toEqual(banco);
    expect(m.get("r7")).toBeNull();
  });

  it("uses the journey's own accommodation only when no hotel card exists", () => {
    const fb = { name: "Villa Zambaldi", address: null };
    expect(tonightByDay(cr, [], fb).get("cr4")).toEqual(fb);
    expect(tonightByDay(cr, [{ dayId: "cr3", ...casita }], fb).get("cr2")).toBeNull();
  });

  it("a one-day journey is not treated as the leaving day", () => {
    expect(tonightByDay([{ id: "a", dayNumber: 1 }], [{ dayId: "a", ...casita }], null).get("a")).toEqual(casita);
  });
});

describe("guestSafeCover", () => {
  it("drops the session-only photo route that broke Costa Rica's cover", () => {
    expect(guestSafeCover("/api/places/photo?ref=abc")).toBeNull();
    expect(guestSafeCover("https://images.unsplash.com/photo-1")).toBe("https://images.unsplash.com/photo-1");
    expect(guestSafeCover(null)).toBeNull();
  });
});
