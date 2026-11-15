import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Plan my trip and Find places are desktop-only on the map (Brennan, 15 Nov 2026:
 * "all the planning is going to be on the computer"; the phone is for being on
 * the trip). Hidden by width, so a phone (< md) never draws them. jsdom applies
 * no media queries, so this reads the classes from the source.
 */
const src = readFileSync(path.join(process.cwd(), "src/components/map/FullMapClient.tsx"), "utf8");

const chipClass = (marker: string) => {
  const at = src.indexOf(`data-desktop-only="${marker}"`);
  expect(at, `the ${marker} chip lost its data-desktop-only marker in FullMapClient.tsx`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("\n", src.indexOf("className=", at)));
};

describe("map chips: planning stays on the desktop", () => {
  it.each(["plan-my-trip", "find-places"])("%s is hidden on the phone and shown from md up", (marker) => {
    const cls = chipClass(marker);
    expect(cls).toMatch(/\bhidden md:flex\b/);
  });

  it("the empty-map hint does not send a phone to Find places", () => {
    expect(src).toMatch(/<span className="hidden md:inline">Tap Find places below, or search above\.<\/span>/);
  });
});
