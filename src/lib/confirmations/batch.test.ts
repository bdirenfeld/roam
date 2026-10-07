import { describe, it, expect } from "vitest";
import type { ParsedConfirmation } from "./toCards";
import { inBatches, combineReads, addedMessage, whenLine } from "./batch";

const booking = (type: ParsedConfirmation["type"], title: string): ParsedConfirmation =>
  ({ type, title, confirmation_number: null, date: "2026-08-25", time: null, end_time: null, address: null, phone: null, website: null, notes: null });

describe("inBatches", () => {
  it("never runs more than the limit at once, and keeps the order", async () => {
    let running = 0, peak = 0;
    const out = await inBatches([5, 1, 4, 2, 3], 3, async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([50, 10, 40, 20, 30]);
  });
});

describe("combineReads", () => {
  it("one list of bookings, each knowing its file; a failed file listed with its reason", () => {
    const c = combineReads([
      { file: { name: "AC890 e-ticket.pdf", type: "application/pdf" }, items: [booking("flight_arrival", "AC 890"), booking("flight_departure", "AC 891")] },
      { file: { name: "blurry.png", type: "image/png" }, reason: "We couldn't read that file." },
      { file: { name: "Borgo.pdf", type: "application/pdf" }, items: [booking("hotel", "Borgo San Felice")] },
      { file: { name: "menu.pdf", type: "application/pdf" }, items: [] },
    ]);
    expect(c.items.map((i) => i.title)).toEqual(["AC 890", "AC 891", "Borgo San Felice"]);
    expect(c.fileOf).toEqual([0, 0, 1]);
    expect(c.files.map((f) => f.name)).toEqual(["AC890 e-ticket.pdf", "Borgo.pdf"]);
    expect(c.failures).toEqual([
      { name: "blurry.png", reason: "We couldn't read that file." },
      { name: "menu.pdf", reason: "No booking found in it." },
    ]);
  });
});

describe("addedMessage", () => {
  it("says how many and which days", () => {
    expect(addedMessage(5, ["2026-08-29", "2026-08-25", null, "2026-08-26"])).toBe("Added 5 bookings · Tue 25 Aug – Sat 29 Aug");
  });
  it("one booking on one day reads singular", () => {
    expect(addedMessage(1, ["2026-08-26"])).toBe("Added to your days · Wed 26 Aug");
  });
});

describe("whenLine", () => {
  const at = { dayNumber: 1, date: "2026-08-25", time: "", endTime: "", outDate: null };
  it("an outbound flight says when it lands", () => {
    expect(whenLine("flight_arrival", { ...at, time: "07:15", endTime: "10:40" })).toBe("Day 1 — Tue, Aug 25 · arrives 10:40 AM");
  });
  it("a flight home says when it leaves", () => {
    expect(whenLine("flight_departure", { ...at, dayNumber: 5, date: "2026-08-29", time: "11:55" })).toBe("Day 5 — Sat, Aug 29 · departs 11:55 AM");
  });
  it("a stay and a car run from one day to another", () => {
    expect(whenLine("hotel", { ...at, outDate: "2026-08-29" })).toBe("Check in Tue, Aug 25 → out Sat, Aug 29");
    expect(whenLine("car_rental", { ...at, outDate: "2026-08-29" })).toBe("Tue, Aug 25 → Sat, Aug 29");
  });
  it("an activity gives its day and time", () => {
    expect(whenLine("activity", { ...at, dayNumber: 2, date: "2026-08-26", time: "10:00" })).toBe("Day 2 — Wed, Aug 26 · 10:00 AM");
  });
});
