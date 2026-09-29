import { describe, it, expect } from "vitest";
import { hoursWindow, retimeDay, sightMinutes, type RetimeItem } from "./retime";

// Hours as Google saved them on Brennan's Japan places (live, 29 Sep 2026).
const daily = (open: string, close: string, days = [0, 1, 2, 3, 4, 5, 6]) => ({ periods: days.map((d) => ({ open: { day: d, time: open }, close: { day: d, time: close } })) });
const DISNEYSEA = daily("0900", "2100");
const GHIBLI = daily("1000", "1800", [0, 1, 3, 4, 5, 6]);            // shut Tuesdays
const TOYO = { periods: [{ open: { day: 2, time: "1300" }, close: { day: 2, time: "1700" } }, { open: { day: 6, time: "1200" }, close: { day: 6, time: "1700" } }] };
const GOLDEN_GAI = { periods: [{ open: { day: 0, time: "0000" } }] };  // open 24 hours
const KENSINGTON = { periods: [{ open: { day: 1, time: "0000" }, close: { day: 6, time: "0000" } }] }; // 24 h Mon–Fri
const H = (h: number, m = 0) => h * 60 + m;

describe("hoursWindow", () => {
  it("reads a day's opening and closing, a closed day, and the unknown", () => {
    expect(hoursWindow(DISNEYSEA, "2028-04-02")).toEqual({ open: H(9), close: H(21) });
    expect(hoursWindow(GHIBLI, "2028-04-04")).toBe("closed");            // a Tuesday
    expect(hoursWindow(TOYO, "2028-04-04")).toEqual({ open: H(13), close: H(17) });
    expect(hoursWindow(GOLDEN_GAI, "2028-04-04")).toEqual({ open: 0, close: H(24) });
    expect(hoursWindow(KENSINGTON, "2027-07-01")).toEqual({ open: 0, close: H(24) }); // a Thursday
    expect(hoursWindow(null, "2028-04-04")).toBeNull();
  });
});

describe("retimeDay", () => {
  const sight = (id: string, start: number, share: number, window: RetimeItem["window"]): RetimeItem => ({ id, start, end: start + 90, kind: "sight", minutes: sightMinutes(share), whole: share >= 1, window });
  const meal = (id: string, start: number, end: number, window: RetimeItem["window"]): RetimeItem => ({ id, start, end, kind: "meal", minutes: 0, whole: false, window });

  it("a theme park is the day, from when it opens", () => {
    const t = retimeDay([sight("sea", H(9, 45), 1, { open: H(9), close: H(21) })]);
    expect(t.get("sea")).toEqual({ start: H(9, 45), end: H(16, 45) });
  });

  it("nothing starts before the doors open", () => {
    const t = retimeDay([sight("ghibli", H(9, 45), 0.5, { open: H(10), close: H(18) })]);
    expect(t.get("ghibli")!.start).toBe(H(10));
  });

  it("lunch at a place that opens at one waits until one", () => {
    const t = retimeDay([meal("toyo", H(12, 30), H(13, 45), { open: H(13), close: H(17) })]);
    expect(t.get("toyo")).toEqual({ start: H(13), end: H(14, 15) });
  });

  it("a place that cannot fit inside its hours is left without a time", () => {
    // Dinner at Toyo: it closes at five.
    const t = retimeDay([meal("toyo", H(19, 30), H(20, 45), { open: H(13), close: H(17) })]);
    expect(t.get("toyo")!.end).toBeLessThanOrEqual(H(17));
    const late = retimeDay([sight("a", H(9, 45), 1, null), sight("museum", H(12), 0.5, { open: H(10), close: H(15) })]);
    expect(late.get("museum")).toBeNull();
  });

  it("lunch sits inside a whole day; a second sight waits for the first", () => {
    const t = retimeDay([
      sight("park", H(9, 45), 1, { open: H(9), close: H(21) }),
      meal("lunch", H(12, 30), H(13, 30), null),
    ]);
    expect(t.get("lunch")).toEqual({ start: H(12, 30), end: H(13, 30) });
    const two = retimeDay([sight("ghibli", H(9, 45), 0.5, { open: H(10), close: H(18) }), sight("poke", H(11, 45), 0.5, { open: H(10), close: H(18) })]);
    expect(two.get("poke")!.start).toBe(two.get("ghibli")!.end + 15);
  });

  it("moves round a card already on the day", () => {
    const t = retimeDay([sight("a", H(10), 0.5, null)], [{ start: H(11), end: H(12) }]);
    expect(t.get("a")!.start).toBeGreaterThanOrEqual(H(12));
  });
});
