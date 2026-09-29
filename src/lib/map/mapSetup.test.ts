import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Choppy zoom (29 Sep 2026): Mapbox 3 draws streets-v12 as a globe with fog,
// and every HTML pin re-checks its fog opacity as the map moves. Every map
// that shows pins is flat and fog-free; this reads each one.
const MAPS = ["map/FullMapClient.tsx", "plan/WeekMap.tsx", "day/DayMap.tsx"];

describe("maps are flat and fog-free", () => {
  for (const f of MAPS) {
    it(f, () => {
      const src = readFileSync(path.resolve(__dirname, "../../components", f), "utf8");
      expect(src).toMatch(/projection: "mercator"/);
      expect(src).toMatch(/setFog\(null\)/);
    });
  }
});
