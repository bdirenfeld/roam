import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isHouseholdOwner, HOUSEHOLD_OWNER_ID } from "./household";

describe("isHouseholdOwner", () => {
  it("is true for Brennan's account only", () => {
    expect(isHouseholdOwner(HOUSEHOLD_OWNER_ID)).toBe(true);
  });

  it("is false for anyone else, and for no one", () => {
    // mikescarland — the first stranger to create a dated journey after Your year shipped
    expect(isHouseholdOwner("a3c1b8e2-0000-4000-8000-000000000000")).toBe(false);
    expect(isHouseholdOwner(null)).toBe(false);
    expect(isHouseholdOwner(undefined)).toBe(false);
    expect(isHouseholdOwner("")).toBe(false);
  });
});

// The birthdays must never reach another person's browser. A client component
// that imports them ships them in the page's JavaScript whether or not it draws
// them, so the list may only be imported by server code.
describe("family dates stay on the server", () => {
  const src = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8");

  it("YearView (a client component) does not import them", () => {
    // `import type` is erased at build time and ships nothing; a value import ships the list.
    expect(src("components/trips/YearView.tsx")).not.toMatch(/import\s+(?!type\b)[^;]*yearView\/familyDates/);
  });

  it("the Journeys page gates Your year on the household owner", () => {
    const page = src("app/(app)/trips/page.tsx");
    expect(page).toMatch(/isHouseholdOwner\(/);
    expect(page).toMatch(/familyDates=\{FAMILY_DATES\}/);
  });
});
