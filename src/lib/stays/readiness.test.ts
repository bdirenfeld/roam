import { describe, it, expect } from "vitest";
import { readiness, MIN_PINS } from "./readiness";

/**
 * "We should also have a view that you can't suggest a place to stay until a
 * certain amount of pins are present, because at some points it may be too
 * early in the analysis to find a place" (Brennan, 11 Sept 2026).
 */
describe("whether the journey knows enough yet", () => {
  it("says nothing once there are enough places", () => {
    expect(readiness(MIN_PINS)).toEqual({ ready: true, need: 0, note: null });
    expect(readiness(31).ready).toBe(true);
  });

  it("counts what is missing, and says why rather than just no", () => {
    const r = readiness(3);
    expect(r.ready).toBe(false);
    expect(r.need).toBe(2);
    expect(r.note).toBe("2 more places first. With 3 on the map it is too early to say where the nights should go.");
  });

  it("uses the singular when one will do", () => {
    expect(readiness(4).note).toBe("1 more place first. With 4 on the map it is too early to say where the nights should go.");
  });

  it("starts somewhere else when the map is empty", () => {
    expect(readiness(0).note).toBe("Add some places to the map first. Where to stay is worked out from where you are going.");
    expect(readiness(0).need).toBe(MIN_PINS);
  });

  it("never counts backwards from nonsense", () => {
    expect(readiness(-4).need).toBe(MIN_PINS);
    expect(readiness(2.7).need).toBe(MIN_PINS - 2);
  });
});
