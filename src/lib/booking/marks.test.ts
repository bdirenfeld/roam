import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { checklistRows, type CheckInput } from "./checklist";
import { bookingMarks, bookingsHref, markLabel, marksLabel, tripMarks } from "./marks";

// The same real journeys the checklist is tested on (pulled 6 Oct 2026).
type J = CheckInput & { title: string };
const all = journeys as unknown as J[];
const get = (title: string, over: Partial<CheckInput["trip"]> = {}): CheckInput => {
  const j = all.find((x) => x.title === title)!;
  return { ...j, trip: { ...j.trip, ...over }, cards: j.cards ?? [], days: j.days ?? [], birthdates: j.birthdates ?? [] };
};

describe("the booking marks on a journey's card", () => {
  it("Tuscany as pulled: the villa is booked, flights and car are still to book", () => {
    expect(tripMarks(get("Tuscany"))).toEqual([
      { key: "flights", booked: false },
      { key: "stays", booked: true },
      { key: "car", booked: false },
    ]);
  });

  it("says what Bookings says, row for row, on every journey in the fixture", () => {
    for (const j of all) {
      const input = get(j.title);
      const rows = checklistRows({ ...input, airports: null });
      const marks = tripMarks(input);
      expect(marks.map((m) => m.key), j.title).toEqual(rows.filter((r) => r.state !== "skip").map((r) => r.key));
      for (const m of marks) expect(m.booked, `${j.title} ${m.key}`).toBe(rows.find((r) => r.key === m.key)!.state === "booked");
    }
  });

  it("a row marked Not needed has no mark; one marked Booked by hand is booked", () => {
    const marks = tripMarks(get("Tuscany", { booking_checklist: { car: "skip", flights: "booked" } }));
    expect(marks).toEqual([{ key: "flights", booked: true }, { key: "stays", booked: true }]);
  });

  it("Not booked yet (the owner's own choice) overrides an automatic tick", () => {
    const marks = tripMarks(get("Tuscany", { booking_checklist: { stays: "open" } }));
    expect(marks.find((m) => m.key === "stays")).toEqual({ key: "stays", booked: false });
  });

  it("every row not needed: no marks at all", () => {
    expect(bookingMarks([{ key: "flights", state: "skip" }, { key: "stays", state: "skip" }, { key: "car", state: "skip" }])).toEqual([]);
  });

  it("the words: one mark for the tooltip, the set for the link's name", () => {
    expect(markLabel({ key: "flights", booked: false })).toBe("Flights: still to book");
    expect(markLabel({ key: "stays", booked: true })).toBe("Stays: booked");
    expect(marksLabel("Tuscany", [{ key: "flights", booked: false }, { key: "stays", booked: true }])).toBe("Bookings for Tuscany: flights still to book, stays booked");
  });

  it("a click goes to the week with Bookings open", () => {
    expect(bookingsHref("abc")).toBe("/trips/abc/plan?bookings=1");
  });
});
