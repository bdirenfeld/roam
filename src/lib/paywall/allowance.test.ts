import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_TITLE } from "@/lib/sampleTrip/itinerary";
import {
  FREE_JOURNEYS, PRICE_CENTS, PRICE_LABEL, PAYMENT_REQUIRED,
  canCreateJourney, countedJourneys, isPaymentRequired,
} from "./allowance";

describe("the journey allowance", () => {
  it("is one free journey at $5", () => {
    expect(FREE_JOURNEYS).toBe(1);
    expect(PRICE_CENTS).toBe(500);
    expect(PRICE_LABEL).toBe("$5");
  });

  it("lets a new traveller make their first journey", () => {
    expect(canCreateJourney(false, [])).toBe(true);
    expect(canCreateJourney(null, [])).toBe(true);
  });

  it("asks for payment before the second", () => {
    expect(canCreateJourney(false, [{ title: "Hanoi March 2027" }])).toBe(false);
  });

  it("never counts the sample journey", () => {
    expect(countedJourneys([{ title: SAMPLE_TITLE }, { title: "Rome" }])).toBe(1);
    expect(canCreateJourney(false, [{ title: SAMPLE_TITLE }])).toBe(true);
  });

  it("never limits someone who paid", () => {
    expect(canCreateJourney(true, Array.from({ length: 8 }, (_, i) => ({ title: `Trip ${i}` })))).toBe(true);
  });

  it("recognises the database trigger's error", () => {
    expect(isPaymentRequired({ message: `${PAYMENT_REQUIRED}: first journey is free` })).toBe(true);
    expect(isPaymentRequired({ message: "duplicate key value" })).toBe(false);
    expect(isPaymentRequired(null)).toBe(false);
  });
});

// The rule lives twice: here and in the trigger. This reads the migration so a
// change to one without the other goes red, naming the file to fix.
describe("the database trigger matches", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/021_paywall_journey_allowance.sql"), "utf8");
  it("raises the same marker", () => {
    expect(sql, "supabase/migrations/021_paywall_journey_allowance.sql").toContain(PAYMENT_REQUIRED);
  });
  it("skips the same sample title", () => {
    expect(sql, "supabase/migrations/021_paywall_journey_allowance.sql").toContain(`'${SAMPLE_TITLE}'`);
  });
  it("allows the same number of free journeys", () => {
    expect(sql, "supabase/migrations/021_paywall_journey_allowance.sql").toMatch(new RegExp(`>=\\s*${FREE_JOURNEYS}\\b`));
  });
});
