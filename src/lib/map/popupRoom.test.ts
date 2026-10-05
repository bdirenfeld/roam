import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { popupPanY, POPUP_LIFT } from "./popupRoom";

// Measured live on Tuscany's Map tab, 5 Oct 2026: map spans y 64–827,
// popup 338 px tall, pin at y 252 → popup top at -104.
describe("popupPanY", () => {
  it("does nothing when the popup fits below the map's top", () => {
    expect(popupPanY(338, 600, 64, 827)).toBe(0);
  });

  it("slides the map down by exactly the overhang plus the margin", () => {
    // top = 252 - 18 - 338 = -104; needs to reach 64 + 8 = 72 → 176.
    expect(popupPanY(338, 252, 64, 827)).toBe(176);
  });

  it("never pushes the pin off the bottom of the map", () => {
    // A short map: the pin can only move to 500 - 8 - 24 = 468.
    expect(popupPanY(600, 400, 64, 500)).toBe(68);
  });

  it("returns 0 rather than a negative when the pin is already at the bottom", () => {
    expect(popupPanY(600, 495, 64, 500)).toBe(0);
  });

  it("keeps POPUP_LIFT in step with MapPinPopup's PIN_R + GAP", () => {
    const src = readFileSync(join(__dirname, "../../components/map/MapPinPopup.tsx"), "utf8");
    const pinR = Number(/const PIN_R\s*=\s*(\d+)/.exec(src)![1]);
    const gap = Number(/const GAP\s*=\s*(\d+)/.exec(src)![1]);
    expect(POPUP_LIFT, "change POPUP_LIFT in lib/map/popupRoom.ts").toBe(pinR + gap);
  });
});
