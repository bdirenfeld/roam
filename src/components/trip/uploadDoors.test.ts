import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// Every door that uploads a booking goes through ONE hook (6 Oct 2026, taps
// audit): several files in one pick, the same check-and-add sheet, the same
// "Added N bookings · days · Undo" toast. The phone's day, the Map tab and the
// Plan board each had their own single-file copy; a copy here would bring back
// a door that takes one file and says nothing when it is done.
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("every booking upload door uses useBookingUpload", () => {
  it.each([
    "day/DayViewClient.tsx",
    "map/FullMapClient.tsx",
    "plan/PlanBoard.tsx",
    "plan/WeekBoard.tsx",
    "trip/BookingsSection.tsx",
  ])("%s", (file) => {
    const src = read(file);
    expect(src, `${file} should call useBookingUpload`).toContain("useBookingUpload(");
    expect(src, `${file} reads confirmations itself; use the hook`).not.toContain("/api/confirmations/parse");
    expect(src, `${file} has its own file input; use the hook's element`).not.toMatch(/type="file"/);
    expect(src, `${file} renders the sheet itself; the hook does`).not.toMatch(/<ConfirmationPreviewSheet\b/);
  });
});
