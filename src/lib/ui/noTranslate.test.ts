import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Chrome auto-translated Roam (19 Nov 2026): it took the page for foreign
 * (Italian place names) and rewrote "3 h" as "3 hours" and "10 h 30" as
 * "10:30". The root layout opts out; this keeps it that way.
 */
describe("Roam is never auto-translated", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  it("the <html> says translate=\"no\" and the page carries Google's notranslate", () => {
    expect(layout).toMatch(/<html[^>]*translate="no"/);
    expect(layout).toMatch(/google:\s*"notranslate"/);
  });
});
