import { describe, it, expect } from "vitest";
import { forecastWindow } from "./weatherWindow";

describe("forecastWindow", () => {
  it("a journey months away has no forecast yet, and asks for none", () => {
    expect(forecastWindow("2027-07-01", "2027-08-31", "2026-09-27")).toBeNull();
  });
  it("a long journey starting soon gets its first sixteen days, not an error", () => {
    expect(forecastWindow("2026-10-01", "2026-11-30", "2026-09-27")).toEqual({ start: "2026-10-01", end: "2026-10-12" });
  });
  it("a journey under way keeps its past days back to 92", () => {
    expect(forecastWindow("2026-09-20", "2026-09-30", "2026-09-27")).toEqual({ start: "2026-09-20", end: "2026-09-30" });
    expect(forecastWindow("2026-01-01", "2026-09-30", "2026-09-27")!.start).toBe("2026-06-27");
  });
});
