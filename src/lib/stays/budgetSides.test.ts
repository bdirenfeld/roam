// ── A bug that lives BETWEEN two files ────────────────────────────────────
// The sheet parses the typed budget against the base's nights; the route
// parsed it against the whole journey's. "9,000 total" typed on Tokyo read
// as $1,125 a night on the sheet and was written to the Estimate as $692
// (audit, 15 Sept 2026). Neither file can see the other, so this test reads
// both — the pattern from lib/ui/layers.test.ts — and its failure names the
// file that has to change.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("the budget is parsed against the same nights on both sides", () => {
  it("the search route parses against the base's nights, not the journey's", () => {
    const route = read("src/app/api/stays/search/route.ts");
    expect(route, "search/route.ts: parseBudget must take baseNights (the base being searched), not brief.nights")
      .toMatch(/parseBudget\(body\.budget,\s*baseNights\)/);
    expect(route).not.toMatch(/parseBudget\(body\.budget,\s*brief\.nights\)/);
  });
  it("the sheet parses against the base's nights too", () => {
    const sheet = read("src/components/map/WhereToStaySheet.tsx");
    expect(sheet, "WhereToStaySheet.tsx: parseBudget must take `nights` (the base's) so the hint matches what the route writes")
      .toMatch(/parseBudget\(budget,\s*nights\)/);
  });
});
