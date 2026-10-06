import { describe, it, expect } from "vitest";
import { stuckCount, STUCK_MS } from "./stuck";

describe("stuckCount", () => {
  const now = 1_000_000_000;
  it("a change younger than two minutes is not stuck", () => {
    expect(stuckCount([{ createdAt: now - 30_000 }], now)).toBe(0);
  });
  it("one still waiting after two minutes is", () => {
    expect(stuckCount([{ createdAt: now - STUCK_MS }, { createdAt: now - 10_000 }], now)).toBe(1);
  });
  it("nothing queued, nothing stuck", () => {
    expect(stuckCount([], now)).toBe(0);
  });
});
