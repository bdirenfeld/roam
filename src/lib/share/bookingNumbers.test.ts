import { describe, it, expect } from "vitest";
import { stripBookingNumbers, guestCardText } from "./bookingNumbers";

// The shared page hides booking numbers (7 Oct 2026, re-audit).
describe("stripBookingNumbers", () => {
  it("his note: the Expedia itinerary number and who issued it go, the room stays", () => {
    expect(stripBookingNumbers("Suite, 1 King Bed, 2 adults, nonsmoking, Expedia For TD itinerary: 73544719922491"))
      .toBe("Suite, 1 King Bed, 2 adults, nonsmoking");
  });

  it("confirmation, booking ref, PNR and reservation numbers", () => {
    expect(stripBookingNumbers("Confirmation #ABC123")).toBe("");
    expect(stripBookingNumbers("Check-in 3 PM. Confirmation #ABC123. Free parking.")).toBe("Check-in 3 PM. Free parking.");
    expect(stripBookingNumbers("Booking ref: X1Y2Z3 — pay at the desk")).toBe("pay at the desk");
    expect(stripBookingNumbers("Air Canada AC 890, PNR ABC123, seats 14A–C")).toBe("Air Canada AC 890, seats 14A–C");
    expect(stripBookingNumbers("PNR QXKLMN")).toBe("");
    expect(stripBookingNumbers("Dinner for 5 at 8 PM (reservation no. 48213X)")).toBe("Dinner for 5 at 8 PM");
    expect(stripBookingNumbers("Hotel confirmed. Confirmation number: 12345678. Late check-out 1 PM")).toBe("Hotel confirmed. Late check-out 1 PM");
    expect(stripBookingNumbers("Record locator: K7P2QZ")).toBe("");
    expect(stripBookingNumbers("Garden room (Conf 9ZX12K) with a view")).toBe("Garden room with a view");
    expect(stripBookingNumbers("Booked via the Expedia app, itinerary 7300112233")).toBe("Booked via the Expedia app");
  });

  it("any run of 8 or more digits", () => {
    expect(stripBookingNumbers("Ferry ticket 9912345678, deck seats")).toBe("Ferry ticket, deck seats");
  });

  it("leaves ordinary sentences alone, booking words included", () => {
    const keep = [
      "Booking essential 2 weeks ahead; opens 9 AM.",
      "Reservation for 4 at 7:30 PM, terrace if dry.",
      "Lunch only. Google 4.6 (4,600). Closed Mondays.",
      "Itinerary: Day 1 Florence, Day 2 Siena",
      "Booked for 2026-10-05, arrive 15 minutes early",
      "Call +39 055 123 4567 to change the time",
    ];
    for (const s of keep) expect(stripBookingNumbers(s)).toBe(s);
  });

  it("keeps the lines of a multi-line note", () => {
    expect(stripBookingNumbers("**Intent**\nQuiet room, garden view.\nConfirmation: 88KQ21Z\n- Breakfast 7–10"))
      .toBe("**Intent**\nQuiet room, garden view.\n\n- Breakfast 7–10");
  });
});

describe("guestCardText", () => {
  it("never carries details.confirmation, or any other key", () => {
    const out = guestCardText({ title: "Hotel Lungarno", notes: "Garden suite", named: true, confirmation: "73544719922491", booking_ref: "X1Y2Z3" });
    expect(out).toEqual({ title: "Hotel Lungarno", note: "Garden suite", named: true });
    expect(JSON.stringify(out)).not.toMatch(/73544719922491|X1Y2Z3/);
  });

  it("strips numbers from the note and the title; empty becomes null", () => {
    expect(guestCardText({ notes: "Confirmation #ABC123" }).note).toBeNull();
    expect(guestCardText({ title: "Flight AC 890 · PNR ABC123" }).title).toBe("Flight AC 890");
    expect(guestCardText(null)).toEqual({ title: null, note: null, named: false });
  });
});

// Between two files (roam-ship §0): the journey page must read card details
// only through guestCardText, or a new line could send a raw note again.
describe("the shared journey page", () => {
  it("reads card details only through guestCardText", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve(__dirname, "../../app/journey/[token]/page.tsx"), "utf8");
    expect(src).toContain("guestCardText(c.details)");
    expect(src).not.toMatch(/details\??\.(notes|title|named|confirmation)/);
    expect(src).not.toMatch(/details\[/);
  });
});
