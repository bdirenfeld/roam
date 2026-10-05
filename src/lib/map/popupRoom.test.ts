import { describe, it, expect } from "vitest";
import { popupPanY } from "./popupRoom";

// Numbers from the desktop week map: map spans y 120–900, popup ~420 tall.
describe("popupPanY", () => {
  it("does nothing when the popup fits below the map's top", () => {
    expect(popupPanY(200, 120, 640, 900)).toBe(0);
  });

  it("slides the map down by exactly the overhang plus the margin", () => {
    // Pin at y 300, popup top at -140: 268 px short of 128.
    expect(popupPanY(-140, 120, 300, 900)).toBe(268);
  });

  it("never pushes the pin off the bottom of the map", () => {
    // A short map: the pin can only move to 900 - 8 - 24 = 868.
    expect(popupPanY(-400, 120, 800, 900)).toBe(68);
  });

  it("returns 0 rather than a negative when the pin is already at the bottom", () => {
    expect(popupPanY(-400, 120, 890, 900)).toBe(0);
  });
});
