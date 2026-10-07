import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// 6 Oct 2026: both maps open already framed on their pins — no glide from the
// destination to them. Motion is kept for going somewhere you asked to go.
describe("maps open on the pins, without a zoom", () => {
  it.each([
    ["src/components/map/FullMapClient.tsx", "padding: 80, maxZoom: 15"],
    ["src/components/day/DayMap.tsx", "padding: 50, maxZoom: 14"],
  ])("%s fits its pins without animating", (file, opts) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(src).toContain(`map.fitBounds(bounds, { ${opts}, animate: false })`);
  });
});
