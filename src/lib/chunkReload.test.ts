import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isChunkError, shouldReload } from "./chunkReload";

describe("a lazy screen from an old build", () => {
  it("knows a missing chunk (the error Brennan hit on 30 Sep 2026) from other errors", () => {
    expect(isChunkError(Object.assign(new Error("Loading chunk 3179 failed.\n(error: https://roam-roan.vercel.app/_next/static/chunks/3179.1c69755d1fe59038.js)"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isChunkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
  it("reloads once, not in a loop", () => {
    expect(shouldReload(null, 1_000_000)).toBe(true);
    expect(shouldReload(1_000_000, 1_030_000)).toBe(false);
    expect(shouldReload(1_000_000, 1_070_000)).toBe(true);
  });
  it("every lazy-loaded screen reloads on a stale chunk", () => {
    for (const f of ["src/components/map/FullMapClient.tsx", "src/components/plan/WeekMap.tsx", "src/components/overlays/AppOverlays.tsx"]) {
      const text = readFileSync(f, "utf8");
      const lazy = text.match(/dynamic\(/g)?.length ?? 0;
      const guarded = text.match(/dynamic\(reloadOnStale\(/g)?.length ?? 0;
      expect(guarded, f).toBe(lazy);
      expect(lazy, f).toBeGreaterThan(0);
    }
  });
});
