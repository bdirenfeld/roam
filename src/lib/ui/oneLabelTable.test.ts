import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// 27 Sep 2026: the card sheet and the pin popup kept their own copies of the
// sub-type names, so a place picked as "Explore" read "Self-Directed" on its
// card. Every screen names a kind through lib/subTypeLabel.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}
describe("one table of names", () => {
  it("no component defines its own sub-type label table", () => {
    const own = walk("src/components").filter((f) => /const\s+SUB_?TYPE_LABELS?\s*[:=]/.test(readFileSync(f, "utf8")));
    expect(own, "import SUB_TYPE_LABEL / subTypeLabel from lib/subTypeLabel").toEqual([]);
  });
});
