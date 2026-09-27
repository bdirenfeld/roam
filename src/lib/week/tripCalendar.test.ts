import { describe, it, expect } from "vitest";
import { monthGrids } from "./tripCalendar";

const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.parse(from + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `id-${d}`, date: d };
});

describe("monthGrids", () => {
  it("a July–August summer is two months, Monday first, with the journey's days pickable", () => {
    const m = monthGrids(span("2027-07-01", 62), new Set(["id-2027-08-16"]));
    expect(m.map((x) => x.label)).toEqual(["July 2027", "August 2027"]);
    expect(m[0].weeks[0].slice(0, 3)).toEqual([null, null, null]);       // 1 July 2027 is a Thursday
    expect(m[0].weeks[0][3]).toEqual({ date: "2027-07-01", dayId: "id-2027-07-01", planned: false });
    const aug16 = m[1].weeks.flat().find((c) => c?.date === "2027-08-16");
    expect(aug16?.planned).toBe(true);
    expect(m.every((x) => x.weeks.every((w) => w.length === 7))).toBe(true);
  });
  it("days outside the journey are in the grid but not pickable", () => {
    const m = monthGrids(span("2027-09-16", 4));
    const sep1 = m[0].weeks.flat().find((c) => c?.date === "2027-09-01");
    expect(sep1?.dayId).toBeNull();
    expect(m).toHaveLength(1);
  });
  it("a journey across new year runs December to January", () => {
    expect(monthGrids(span("2027-12-28", 7)).map((x) => x.key)).toEqual(["2027-12", "2028-01"]);
  });
});
