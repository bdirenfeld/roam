import { describe, it, expect } from "vitest";
import { weekStarts, pageOf } from "./pages";

const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10));

describe("weekStarts", () => {
  it("a Friday-to-Monday weekend is one screen", () => {
    expect(weekStarts(span("2027-10-08", 4))).toEqual([0]);
  });
  it("a summer from Thursday 1 July pages Monday to Sunday after its first days", () => {
    const s = weekStarts(span("2027-07-01", 62));
    expect(s.slice(0, 3)).toEqual([0, 4, 11]);         // Thu 1–Sun 4, then Mon 5, Mon 12
    expect(s).toHaveLength(9); // Mon 30 and Tue 31 Aug join the week before
  });
  it("finds the screen a day is on", () => {
    const s = weekStarts(span("2027-07-01", 62));
    expect(pageOf(s, 46)).toBe(7);                      // Mon 16 Aug starts its own week
    expect(s[pageOf(s, 46)]).toBe(46);
    expect(pageOf(s, 2)).toBe(0);
  });
});

describe("weekStarts: no one-day screens", () => {
  it("Japan starts on a Sunday: that Sunday joins the first full week", () => {
    const s = weekStarts(span("2028-04-02", 14)); // Sun 2 Apr – Sat 15 Apr
    expect(s).toEqual([0, 8]);                     // Sun 2–Sun 9, Mon 10–Sat 15
  });
  it("a trip ending on a Monday keeps that Monday with the week before", () => {
    const s = weekStarts(span("2027-07-05", 15)); // Mon 5 – Mon 19
    expect(s).toEqual([0, 7]);
  });
});
