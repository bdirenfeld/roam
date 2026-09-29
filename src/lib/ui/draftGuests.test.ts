import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Plan my trip (28–29 Sep 2026). There is no draft stage: pressing it plans
 * the trip as ordinary cards, with Undo right after and "Remove what Plan my
 * trip added" in the sheet. This checks the doors and that the draft stage
 * stays gone.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("the doors to Plan my trip", () => {
  it("sits beside Filter on the week's map and on the phone Map, owners only", () => {
    expect(read("src/components/plan/WeekMap.tsx")).toMatch(/<PlanMyTripSheet /);
    const map = read("src/components/map/FullMapClient.tsx");
    expect(map).toMatch(/!readOnly && !filterOpen && toPlan >= 2/);
    expect(map).toMatch(/<PlanMyTripSheet/);
  });
  it("the week shows what was planned, with Where to stay and Undo", () => {
    const week = read("src/components/plan/WeekBoard.tsx");
    expect(week).toMatch(/data-plan-tray/);
    expect(week).toMatch(/setShowStays\(true\); setMapWide\(true\); \}\}[^>]*>Where to stay</);
    expect(week).toMatch(/onClick=\{\(\) => void undoPlan\(\)\}[^>]*>Undo</);
    expect(week).toMatch(/onDraftCreated=\{draftCreated\}/);
  });
  it("the sheet can take off what it added", () => {
    expect(read("src/components/plan/PlanMyTripSheet.tsx")).toMatch(/Remove what Plan my trip added/);
  });
});

describe("no draft stage", () => {
  it("no dashed draft, no per-day Keep, no draft bar", () => {
    for (const f of ["src/components/plan/WeekBoard.tsx", "src/components/day/DayViewClient.tsx", "src/components/cards/CardSurface.tsx"]) {
      expect(read(f)).not.toMatch(/isDraft|data-draft|Keep this day|Keep all days/);
    }
  });
  it("Plan my trip and Where to stay share one rule for a base", () => {
    expect(read("src/lib/plan/dayGroups.ts")).toMatch(/export \{ REGION_KM \} from "@\/lib\/stays\/brief"/);
  });
});
