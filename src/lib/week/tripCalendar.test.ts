import { describe, it, expect } from "vitest";
import { monthGrids, dayMarks } from "./tripCalendar";

const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.parse(from + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `id-${d}`, date: d };
});

describe("monthGrids", () => {
  it("a July–August summer is two months, Monday first, with the journey's days pickable", () => {
    const m = monthGrids(span("2027-07-01", 62), new Set(["id-2027-08-16"]));
    expect(m.map((x) => x.label)).toEqual(["July 2027", "August 2027"]);
    expect(m[0].weeks[0].slice(0, 3)).toEqual([null, null, null]);       // 1 July 2027 is a Thursday
    expect(m[0].weeks[0][3]).toEqual({ date: "2027-07-01", dayId: "id-2027-07-01", planned: false, travel: false });
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
  it("travel days are marked apart from planned ones", () => {
    const m = monthGrids(span("2027-07-01", 3), new Set(["id-2027-07-01", "id-2027-07-02"]), new Set(["id-2027-07-01"]));
    const cells = m[0].weeks.flat().filter((c) => c?.dayId);
    expect(cells.map((c) => [c!.planned, c!.travel])).toEqual([[true, true], [true, false], [false, false]]);
  });
});

// Rows shaped as the phone calendar reads them, from the Europe summer journey
// (27 Sep 2026): day 1 lands at Heathrow and checks in, day 2 is the British
// Museum, day 10 takes the train from St Pancras, and a place-less note card.
describe("dayMarks", () => {
  it("a flight, a train or a hotel makes a travel day; anything else a planned one", () => {
    const { planned, travel } = dayMarks([
      { day_id: "d1", sub_type: "flight_arrival" },
      { day_id: "d1", sub_type: "hotel" },
      { day_id: "d2", sub_type: "guided" },
      { day_id: "d10", sub_type: "transit" },
      { day_id: "d11", sub_type: null },
      { day_id: null, sub_type: "restaurant" },
    ]);
    expect(Array.from(planned).sort()).toEqual(["d1", "d10", "d11", "d2"]);
    expect(Array.from(travel).sort()).toEqual(["d1", "d10"]);
  });
});
