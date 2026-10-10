import { describe, it, expect } from "vitest";
import { shouldOpenFirstRun } from "./FirstRunOpen";

// 10 Oct 2026: a first sign-in opens the Plan a journey form once per session.
describe("first-run form", () => {
  it("opens once per session, then leaves the empty state alone", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(shouldOpenFirstRun(store)).toBe(true);
    expect(shouldOpenFirstRun(store)).toBe(false);
  });

  it("opens when storage is missing or refuses", () => {
    expect(shouldOpenFirstRun(null)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {},
    };
    expect(shouldOpenFirstRun(broken)).toBe(true);
  });
});
