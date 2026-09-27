import { describe, it, expect } from "vitest";
import { weeksOf } from "./repeat";

const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.parse(from + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: d, date: d };
});

describe("weeksOf", () => {
  it("groups a journey that starts on a Thursday into Monday weeks", () => {
    const w = weeksOf(span("2027-07-01", 62)); // Thu 1 Jul – Tue 31 Aug
    expect(w[0].monday).toBe("2027-06-28");
    expect(w[0].days.map((d) => d.date)).toEqual(["2027-07-01", "2027-07-02", "2027-07-03", "2027-07-04"]);
    expect(w[0].weekdays.map((d) => d.date)).toEqual(["2027-07-01", "2027-07-02"]);
    expect(w[1].weekdays).toHaveLength(5);
    expect(w[w.length - 1].days.map((d) => d.date)).toEqual(["2027-08-30", "2027-08-31"]);
    expect(w.reduce((n, g) => n + g.days.length, 0)).toBe(62);
  });
  it("takes days in any order", () => {
    const w = weeksOf([{ id: "b", date: "2027-08-17" }, { id: "a", date: "2027-08-16" }]);
    expect(w).toHaveLength(1);
    expect(w[0].weekdays.map((d) => d.id)).toEqual(["a", "b"]);
  });
});
