import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// "Drop to take it off the day" sat at the bottom of the computer's map, under
// the Filter / Plan my trip / Find places row (4 Oct 2026). It is centred now,
// and layered above that row.
describe("the week map's drop-off-the-day pill", () => {
  it("is centred, not at the bottom, and above the map's buttons", () => {
    const src = readFileSync(join(__dirname, "WeekMap.tsx"), "utf8");
    const line = src.split("\n").find((l) => l.includes('data-testid="drop-off-day"'))!;
    expect(line).toContain("items-center");
    expect(line).not.toContain("items-end");
    expect(line).toMatch(/z-\[(\d+)\]/);
    expect(Number(line.match(/z-\[(\d+)\]/)![1])).toBeGreaterThan(10);
  });
});
