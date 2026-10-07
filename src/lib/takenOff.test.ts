import { describe, it, expect } from "vitest";
import { takenOffDayToast, takenOffMapToast } from "./takenOff";

describe("the take-off toasts (6 Oct 2026, taps audit)", () => {
  it("day view names the weekday and says the place is still saved", () => {
    // Tuscany: Friday 27 Aug 2027.
    expect(takenOffDayToast("2027-08-27")).toBe("Taken off Fri · still on your map");
  });

  it("day view never says 'deleted'", () => {
    expect(takenOffDayToast("2027-08-27")).not.toMatch(/delet/i);
    expect(takenOffDayToast("not a date")).toBe("Taken off this day · still on your map");
  });

  it("map names the day number, as the pin's card does", () => {
    expect(takenOffMapToast(3)).toBe("Taken off Day 3");
    expect(takenOffMapToast(null)).toBe("Taken off the day");
    expect(takenOffMapToast(3)).not.toMatch(/Removed/);
  });
});
