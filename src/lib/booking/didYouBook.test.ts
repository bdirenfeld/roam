import { describe, it, expect } from "vitest";
import type { CheckRow, RowKey } from "./checklist";
import { asking, openedKey, readOpened, withOpened, withoutOpened, writeOpened, type KeyStore } from "./didYouBook";

/** "Did you book it?" memory (7 Oct 2026, delight audit). */

const mem = (): KeyStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const row = (key: RowKey, state: CheckRow["state"]): CheckRow => ({ key, title: key, line: "", state, manual: null, url: null, cost: null, dayId: null, name: null });

describe("the remembered rows", () => {
  it("round-trips per journey, in row order, and an empty list removes the entry", () => {
    const s = mem();
    writeOpened(s, "t1", ["car", "flights"]);
    expect(readOpened(s, "t1")).toEqual(["flights", "car"]);
    expect(readOpened(s, "t2")).toEqual([]);
    writeOpened(s, "t1", []);
    expect(s.m.has(openedKey("t1"))).toBe(false);
  });

  it("junk, a missing store and a throwing store are all nothing, never an error", () => {
    const s = mem();
    s.m.set(openedKey("t1"), "{not json");
    expect(readOpened(s, "t1")).toEqual([]);
    s.m.set(openedKey("t1"), JSON.stringify(["car", "boats", 4]));
    expect(readOpened(s, "t1")).toEqual(["car"]);
    expect(readOpened(null, "t1")).toEqual([]);
    const boom: KeyStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("x"); } };
    expect(readOpened(boom, "t1")).toEqual([]);
    expect(() => writeOpened(boom, "t1", ["car"])).not.toThrow();
    expect(() => writeOpened(null, "t1", ["car"])).not.toThrow();
  });

  it("adds without duplicates and takes one off when answered", () => {
    expect(withOpened(["car"], ["flights", "car"])).toEqual(["flights", "car"]);
    expect(withoutOpened(["flights", "car"], "flights")).toEqual(["car"]);
  });
});

describe("which rows ask", () => {
  it("only remembered rows that are still to book: booked or not-needed rows never ask", () => {
    const rows = [row("flights", "open"), row("stays", "booked"), row("car", "skip")];
    expect(Array.from(asking(rows, ["flights", "stays", "car"]))).toEqual(["flights"]);
    expect(Array.from(asking(rows, []))).toEqual([]);
  });
});
