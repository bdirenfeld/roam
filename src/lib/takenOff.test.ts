import { describe, it, expect } from "vitest";
import { takenOffDayToast, takenOffMapToast } from "./takenOff";

describe("the take-off toasts (6 Oct 2026, taps audit)", () => {
  it("day view names the day as 'Fri 27' and says the place is still saved", () => {
    // Tuscany: Friday 27 Aug 2027. One day name everywhere (7 Oct 2026, re-audit).
    expect(takenOffDayToast("2027-08-27")).toBe("Taken off Fri 27 · still on your map");
    expect(takenOffDayToast("2027-08-27", true)).toBe("Taken off Fri 27 Aug · still on your map");
  });

  it("day view never says 'deleted'", () => {
    expect(takenOffDayToast("2027-08-27")).not.toMatch(/delet/i);
    expect(takenOffDayToast("not a date")).toBe("Taken off this day · still on your map");
  });

  it("map names the day the same way, not 'Day 3' (7 Oct 2026, re-audit)", () => {
    expect(takenOffMapToast("2027-08-27")).toBe("Taken off Fri 27");
    expect(takenOffMapToast("2027-08-27", true)).toBe("Taken off Fri 27 Aug");
    expect(takenOffMapToast(null)).toBe("Taken off the day");
    expect(takenOffMapToast("2027-08-27")).not.toMatch(/Removed|Day \d/);
  });
});
