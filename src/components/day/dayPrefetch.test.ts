import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Day switching on the phone (3 Oct 2026, speed): the day view must warm the
// days either side IN FULL, or a route with loading.tsx prefetches only its
// skeleton and every switch waits on the server; and next.config must keep a
// full prefetch usable for a while.
describe("the phone day warms its neighbours", () => {
  it("prefetches the previous and next day with kind full", () => {
    const src = readFileSync(join(__dirname, "DayViewClient.tsx"), "utf8");
    expect(src).toMatch(/kind: "full"/);
    expect(src).toMatch(/router\.prefetch\(`\/trips\/\$\{trip\.id\}\/days\/\$\{prevDay\.id\}`, full\)/);
    expect(src).toMatch(/router\.prefetch\(`\/trips\/\$\{trip\.id\}\/days\/\$\{nextDay\.id\}`, full\)/);
  });

  it("next.config keeps a full prefetch for 60 s", () => {
    const cfg = readFileSync(join(__dirname, "..", "..", "..", "next.config.mjs"), "utf8");
    expect(cfg).toMatch(/staleTimes:\s*\{\s*dynamic:\s*0,\s*static:\s*60\s*\}/);
  });
});
