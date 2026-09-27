import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// 27 Sep 2026: on a computer, Back, search results and a new journey landed
// the owner on the old agenda page. The day page now sends a computer to the
// week with ?day=, and the week opens that day in place. The bug lives between
// the two files, so this reads both.
const dayPage = readFileSync("src/app/(app)/trips/[tripId]/days/[dayId]/page.tsx", "utf8");
const week = readFileSync("src/components/plan/WeekBoard.tsx", "utf8");

describe("a day on a computer opens in the week", () => {
  it("the day page sends a desktop owner to the week with the day", () => {
    expect(dayPage).toMatch(/access === "owner"/);
    expect(dayPage).toMatch(/isPhone\(/);
    expect(dayPage).toContain("/plan?day=${dayId}");
  });
  it("the week reads ?day and opens that day in place, on the right week", () => {
    expect(week).toContain('searchParams.get("day")');
    expect(week).toMatch(/setWeekStart\(Math\.floor\(i \/ 7\) \* 7\)/);
    expect(week).toMatch(/setFocusDayId\(id\)/);
  });
});

describe("the week carries the entry check", () => {
  it("renders EntryLine, since a computer no longer opens the day page", () => {
    expect(week).toContain("<EntryLine");
  });
});
