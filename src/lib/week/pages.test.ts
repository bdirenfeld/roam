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
    expect(s).toHaveLength(10);
  });
  it("finds the screen a day is on", () => {
    const s = weekStarts(span("2027-07-01", 62));
    expect(pageOf(s, 46)).toBe(7);                      // Mon 16 Aug starts its own week
    expect(s[pageOf(s, 46)]).toBe(46);
    expect(pageOf(s, 2)).toBe(0);
  });
});
