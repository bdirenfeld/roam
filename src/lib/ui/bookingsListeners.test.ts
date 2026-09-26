import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The desktop menu's Bookings row does not open anything itself: the menu
 * lives in the masthead, the sheet belongs to the screen underneath, so the
 * row fires a window event and the screen opens its own sheet.
 *
 * On 26 Sept 2026 the row did nothing on the desktop Plan. The Agenda and the
 * Map listened for the event; the week (WeekBoard), which replaced the old
 * Plan board on desktop two days earlier, never did. Like the z-index bug in
 * layers.test.ts, it lives between two files, so it is checked here, where
 * both can be read.
 *
 * A new desktop screen that shows the masthead's journey menu goes in SCREENS.
 */

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const SCREENS = [
  "components/plan/WeekBoard.tsx",      // desktop Plan (the week)
  "components/day/DayViewClient.tsx",   // Agenda
  "components/map/FullMapClient.tsx",   // Map (guests)
];

describe("the masthead's Bookings row", () => {
  const masthead = read("components/ui/DesktopMasthead.tsx");
  const event = masthead.match(/key: "bookings"[^\n]*CustomEvent\("([^"]+)"\)/)?.[1];

  it("fires a named event", () => {
    expect(event, "DesktopMasthead's Bookings row no longer fires an event").toBeTruthy();
  });

  for (const file of SCREENS) {
    it(`is heard by ${file}`, () => {
      const src = read(file);
      expect(
        src.includes(`addEventListener("${event}"`),
        `${file} does not listen for "${event}", so Bookings in the desktop menu does nothing on that screen`,
      ).toBe(true);
    });
  }
});
