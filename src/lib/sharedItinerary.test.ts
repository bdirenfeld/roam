import { describe, it, expect } from "vitest";
import { tonightByDay, guestSafeCover } from "./sharedItinerary";

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

  it("carries the check-in card's note (check-in time, Wi-Fi), not the check-out's (2 Oct 2026)", () => {
    const tus = Array.from({ length: 12 }, (_, i) => ({ id: `t${i + 1}`, dayNumber: i + 1 }));
    const villa = { name: "Villa Zambaldi", address: "Via Fonda" };
    const m = tonightByDay(tus, [
      { dayId: "t12", ...villa, note: "Load the car, keys as the host asks. Out by 8:30." },
      { dayId: "t1", ...villa, note: "Check in from 4pm. Wi-Fi: ZambaldiGuest" },
    ], null);
    expect(m.get("t1")?.note).toBe("Check in from 4pm. Wi-Fi: ZambaldiGuest");
    expect(m.get("t7")?.note).toBe("Check in from 4pm. Wi-Fi: ZambaldiGuest");
    expect(m.get("t12")).toBeNull();
    // No note on the card: none on the page, and no empty fold.
    expect(tonightByDay(tus, [{ dayId: "t1", ...villa, note: "  " }], null).get("t3")).toEqual(villa);
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
