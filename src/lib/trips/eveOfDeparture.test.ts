import { describe, it, expect } from "vitest";
import { claimEve, eveKey, eveMessage, eveSeen, eveTown, isEveOfDeparture, stillToBook } from "./eveOfDeparture";

// Eve of departure (7 Oct 2026, delight audit, mock d11).
function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as Storage;
}

describe("isEveOfDeparture", () => {
  it("is true only the day before the start date", () => {
    expect(isEveOfDeparture("2026-10-08", "2026-10-07")).toBe(true);
    expect(isEveOfDeparture("2026-10-08", "2026-10-08")).toBe(false);
    expect(isEveOfDeparture("2026-10-08", "2026-10-06")).toBe(false);
    expect(isEveOfDeparture("2026-10-08", "2026-10-09")).toBe(false);
  });
  it("crosses month and year ends", () => {
    expect(isEveOfDeparture("2026-11-01", "2026-10-31")).toBe(true);
    expect(isEveOfDeparture("2027-01-01", "2026-12-31")).toBe(true);
  });
  it("is false without a start date", () => {
    expect(isEveOfDeparture(null, "2026-10-07")).toBe(false);
    expect(isEveOfDeparture("", "2026-10-07")).toBe(false);
  });
});

describe("eveMessage", () => {
  it("says all booked when nothing is open", () => {
    expect(eveMessage("Lisbon, Portugal", 0)).toBe("Lisbon tomorrow · all booked ✓");
  });
  it("counts what is still to book", () => {
    expect(eveMessage("Lisbon, Portugal", 2)).toBe("Lisbon tomorrow · 2 still to book");
    expect(eveMessage("Tuscany", 1)).toBe("Tuscany tomorrow · 1 still to book");
  });
  it("uses the first comma part of the destination", () => {
    expect(eveTown("Kyoto, Kansai, Japan")).toBe("Kyoto");
    expect(eveTown("Palm Springs")).toBe("Palm Springs");
  });
});

describe("stillToBook", () => {
  it("counts open rows only: booked and not needed are done", () => {
    expect(stillToBook([{ state: "booked" }, { state: "skip" }, { state: "booked" }])).toBe(0);
    expect(stillToBook([{ state: "open" }, { state: "skip" }, { state: "open" }])).toBe(2);
  });
});

describe("claimEve", () => {
  it("shows once per journey per device", () => {
    const s = memStore();
    expect(eveSeen(s, "t1")).toBe(false);
    expect(claimEve(s, "t1")).toBe(true);
    expect(s.getItem(eveKey("t1"))).toBe("1");
    expect(eveSeen(s, "t1")).toBe(true);
    expect(claimEve(s, "t1")).toBe(false);
    expect(claimEve(s, "t2")).toBe(true);
  });
  it("never shows when storage is missing or throws", () => {
    expect(claimEve(null, "t1")).toBe(false);
    expect(eveSeen(null, "t1")).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(claimEve(broken, "t1")).toBe(false);
    expect(eveSeen(broken, "t1")).toBe(true);
    const readOnly = { getItem: () => null, setItem: () => { throw new Error("quota"); } } as unknown as Storage;
    expect(claimEve(readOnly, "t1")).toBe(false);
  });
});
