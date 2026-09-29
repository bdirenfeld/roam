import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tripHref } from "./tripHref";

describe("tripHref", () => {
  it("an owner on a computer goes straight to the week; a phone or a guest to the day", () => {
    expect(tripHref("t", { phone: false, owner: true, openDayId: "d" })).toBe("/trips/t/plan");
    expect(tripHref("t", { phone: true, owner: true, openDayId: "d" })).toBe("/trips/t/days/d");
    expect(tripHref("t", { phone: false, owner: false, openDayId: "d" })).toBe("/trips/t/days/d");
    expect(tripHref("t", { phone: false, owner: false })).toBe("/trips/t");
  });
});

describe("the Journeys page links through tripHref", () => {
  // The bug lived between the links and the redirects; read the links.
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8");
  it("cards, the year and the past and archived lists use the one rule", () => {
    expect(read("app/(app)/trips/page.tsx")).toMatch(/tripHref\(/);
    for (const f of ["components/ui/TripCard.tsx", "components/trip/PastJourneysList.tsx", "components/trips/YearView.tsx"]) {
      expect(read(f), f).not.toMatch(/\/days\/\$\{/);
    }
  });
});
