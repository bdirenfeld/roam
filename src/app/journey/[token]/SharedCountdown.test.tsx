import { describe, it, expect } from "vitest";
import { sharedCountdown } from "./SharedCountdown";

describe("shared page countdown (7 Oct 2026)", () => {
  it("before the trip says how far; during and after it says nothing", () => {
    expect(sharedCountdown("2026-10-09", "2026-10-12", "2026-10-06")).toBe("in 3 days");
    expect(sharedCountdown("2026-10-09", "2026-10-12", "2026-10-08")).toBe("tomorrow");
    expect(sharedCountdown("2027-03-14", "2027-03-17", "2026-10-06")).toBe("in 5 months");
    expect(sharedCountdown("2026-10-09", "2026-10-12", "2026-10-10")).toBeNull();
    expect(sharedCountdown("2026-10-09", "2026-10-12", "2026-10-14")).toBeNull();
  });
});
