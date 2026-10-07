import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// 6 Oct 2026: the cruise switch sits right after the word and says yes or no on
// its own — no "Yes, on a ship" / "No" text pushing it to the far right.
describe("cruise row", () => {
  it.each(["src/components/trip/TripSettingsClient.tsx", "src/components/trip/NewJourneyForm.tsx"])("%s has no yes/no words beside the switch", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(src).not.toContain('"Yes, on a ship"');
    expect(src).toContain('aria-label="Cruise"');
  });
});
