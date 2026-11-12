// The desktop ground and the masthead (Brennan, 12 Nov 2026): neutral grey #F0F0F0 behind
// the cards, an ink bar on top. The ground lives in several files at once (the CSS var, the
// Tailwind token, and the boards' own bg classes); this fails if they drift apart again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const GROUND = "#F0F0F0";
const OLD = /#F5F4F1/i;

describe("desktop ground", () => {
  it("the CSS var and the Tailwind token agree", () => {
    expect(read("src/app/globals.css")).toContain(`--background: ${GROUND};`);
    expect(read("tailwind.config.ts")).toContain(`parchment: "${GROUND}"`);
  });

  it.each([
    "src/components/plan/WeekBoard.tsx",
    "src/components/plan/PlanBoard.tsx",
    "src/components/map/MapSidebar.tsx",
    "src/app/(app)/trips/[tripId]/plan/loading.tsx",
  ])("%s paints the grey ground, not the old warm white", (f) => {
    const s = read(f);
    expect(s).toContain(GROUND);
    expect(s).not.toMatch(OLD);
  });
});

describe("ink masthead", () => {
  const m = read("src/components/ui/DesktopMasthead.tsx");
  it("the header is ink with white type", () => {
    expect(m).toMatch(/background: INK,\s*color: ON_BAR,/);
    expect(m).not.toMatch(OLD);
  });
  it("Plan a journey is a white button on the bar", () => {
    expect(m).toContain(`background: "#FFFFFF", color: INK`);
  });
});

describe("half-hour line", () => {
  it("the week board draws a dashed line inside each hour", () => {
    expect(read("src/components/plan/WeekBoard.tsx")).toMatch(/data-halfhour="1"[^\n]*dashed/);
  });
});
