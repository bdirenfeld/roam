import { describe, it, expect } from "vitest";
import { toastPlacement } from "./toastPlacement";

// The Bookings sheet at 375×812: its top edge near 520, the toast ~44 tall.
const phone = { viewportW: 375, viewportH: 812, toastH: 44 };

describe("toastPlacement", () => {
  it("no sheet open: the CSS default (bottom-24 on a phone)", () => {
    expect(toastPlacement({ ...phone, sheetTop: null })).toBeNull();
  });

  it("a sheet open: the toast stands 8px above the sheet's top edge, off its footer", () => {
    expect(toastPlacement({ ...phone, sheetTop: 520 })).toEqual({ bottom: 812 - 520 + 8 });
  });

  it("a sheet too tall to leave room (the card sheet, 95dvh): the top of the screen", () => {
    expect(toastPlacement({ ...phone, sheetTop: 41 })).toEqual({ top: 8 });
  });

  it("a very short sheet never pulls the toast below its usual place", () => {
    expect(toastPlacement({ ...phone, sheetTop: 790 })).toEqual({ bottom: 96 });
  });

  // The Map's bottom row rides 12px above Find's half sheet (7 Oct 2026: "the
  // legend at the bottom disappears" when a pin is removed). The toast stands
  // above the row, not on it.
  it("a control riding above the sheet (data-toast-clear): the toast stands above that, not the sheet", () => {
    // Find's half sheet top at 406; the chip row 28px tall, 12px above it.
    expect(toastPlacement({ ...phone, sheetTop: 406, clearTop: 366 })).toEqual({ bottom: 812 - 366 + 8 });
  });

  it("the Filter's pills open with no sheet: the toast lifts above them", () => {
    expect(toastPlacement({ ...phone, sheetTop: null, clearTop: 680 })).toEqual({ bottom: 812 - 680 + 8 });
  });

  it("the closed row sits under the usual place: no change", () => {
    expect(toastPlacement({ ...phone, sheetTop: null, clearTop: 768 })).toBeNull();
  });

  it("from md up sheets are centred cards and the toast is under the masthead: no change", () => {
    expect(toastPlacement({ viewportW: 1280, viewportH: 800, toastH: 44, sheetTop: 300 })).toBeNull();
  });
});
