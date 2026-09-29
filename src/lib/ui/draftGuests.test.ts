import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * A "Plan my trip" draft is the owner's until kept (28 Sep 2026). Draft
 * cards are ordinary scheduled cards with `details.draft`, so every surface a
 * guest reads has to drop them. This names each one; a new guest surface
 * that reads scheduled cards belongs on the list.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("a draft never reaches a guest", () => {
  it("the shared page drops draft cards", () => {
    expect(read("src/app/journey/[token]/page.tsx")).toMatch(/\.filter\(\(c\) => !isDraft\(c\)\)/);
  });
  it("the Map drops them for a guest", () => {
    expect(read("src/components/map/FullMapClient.tsx")).toMatch(/readOnly \? allCards\.filter\(\(c\) => !isDraft\(c\)\) : allCards/);
  });
  it("the day drops them for a guest, and only the owner gets Keep and Clear", () => {
    const day = read("src/components/day/DayViewClient.tsx");
    expect(day).toMatch(/\.filter\(\(c\) => !readOnly \|\| !isDraft\(c\)\)/);
    expect(day).toMatch(/const draftBar = !readOnly && dayDrafts\.length > 0/);
  });
});

describe("the doors to Plan my trip", () => {
  it("sits beside Filter on the week's map and on the phone Map, owners only", () => {
    expect(read("src/components/plan/WeekMap.tsx")).toMatch(/<PlanMyTripSheet /);
    const map = read("src/components/map/FullMapClient.tsx");
    expect(map).toMatch(/!readOnly && !filterOpen && toPlan >= 2/);
    expect(map).toMatch(/<PlanMyTripSheet/);
  });
  it("the week shows the draft and offers Keep and Clear, for a day and for all", () => {
    const week = read("src/components/plan/WeekBoard.tsx");
    expect(week).toMatch(/data-draft-tray/);
    expect(week).toMatch(/Keep this day&rsquo;s draft/);
    expect(week).toMatch(/Clear this day&rsquo;s draft/);
    expect(week).toMatch(/onDraftCreated=\{draftCreated\}/);
  });
});

describe("the draft leads to Where to stay", () => {
  it("the week's tray and the day's bar both open it", () => {
    expect(read("src/components/plan/WeekBoard.tsx")).toMatch(/setShowStays\(true\); setMapWide\(true\); \}\}[^>]*>Where to stay</);
    expect(read("src/components/day/DayViewClient.tsx")).toMatch(/map\?stays=1`\)\}[^>]*>Where to stay</);
  });
  it("Plan my trip and Where to stay share one rule for a base", () => {
    expect(read("src/lib/plan/dayGroups.ts")).toMatch(/export \{ REGION_KM \} from "@\/lib\/stays\/brief"/);
  });
});
