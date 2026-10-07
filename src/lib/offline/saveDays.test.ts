import { describe, it, expect } from "vitest";
import { isUpcoming, readSaved, saveDaysMessage, savedKey, writeSaved, SAVE_EVERY_MS } from "./saveDays";

// Every day of an upcoming journey saved to the phone (7 Oct 2026, offline).
const HOUR = 3_600_000;
const days = [{ id: "d2", date: "2026-11-02" }, { id: "d1", date: "2026-11-01" }];
const base = { tripId: "t1", start: "2026-11-01", end: "2026-11-02", days, lastSaved: null, now: 1_000_000_000_000 };

describe("isUpcoming", () => {
  it("starts within 30 days", () => {
    expect(isUpcoming("2026-11-06", "2026-11-10", "2026-10-07")).toBe(true); // 30 days out
    expect(isUpcoming("2026-11-07", "2026-11-10", "2026-10-07")).toBe(false); // 31
  });
  it("is under way, last day included", () => {
    expect(isUpcoming("2026-10-01", "2026-10-07", "2026-10-07")).toBe(true);
    expect(isUpcoming("2026-10-01", "2026-10-06", "2026-10-07")).toBe(false); // over
  });
  it("no dates: no", () => {
    expect(isUpcoming(null, null, "2026-10-07")).toBe(false);
  });
});

describe("saveDaysMessage", () => {
  it("lists every day's plain URL in date order", () => {
    expect(saveDaysMessage({ ...base, todayISO: "2026-10-20" })).toEqual({
      type: "roam:save-days",
      tripId: "t1",
      days: [{ url: "/trips/t1/days/d1", date: "2026-11-01" }, { url: "/trips/t1/days/d2", date: "2026-11-02" }],
    });
  });
  it("nothing for a journey far off or over", () => {
    expect(saveDaysMessage({ ...base, todayISO: "2026-09-01" })).toBeNull();
    expect(saveDaysMessage({ ...base, todayISO: "2026-11-03" })).toBeNull();
  });
  it("at most once per 12 hours", () => {
    const t = { ...base, todayISO: "2026-10-20" };
    expect(saveDaysMessage({ ...t, lastSaved: base.now - 11 * HOUR })).toBeNull();
    expect(saveDaysMessage({ ...t, lastSaved: base.now - SAVE_EVERY_MS })).not.toBeNull();
    // A clock moved backwards does not lock it out for good.
    expect(saveDaysMessage({ ...t, lastSaved: base.now + 5 * HOUR })).not.toBeNull();
  });
  it("nothing without days", () => {
    expect(saveDaysMessage({ ...base, days: [], todayISO: "2026-10-20" })).toBeNull();
  });
});

describe("the timestamp", () => {
  it("round-trips per journey", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } } as unknown as Storage;
    expect(readSaved(s, "t1")).toBeNull();
    expect(writeSaved(s, "t1", 123)).toBe(true);
    expect(m.get(savedKey("t1"))).toBe("123");
    expect(readSaved(s, "t1")).toBe(123);
  });
  it("unusable storage: read says so, write refuses", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } } as unknown as Storage;
    expect(readSaved(broken, "t1")).toBeUndefined();
    expect(readSaved(null, "t1")).toBeUndefined();
    expect(writeSaved(broken, "t1", 1)).toBe(false);
  });
});
