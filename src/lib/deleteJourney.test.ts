import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteJourney } from "./deleteJourney";
import { TRIP_CHILDREN } from "./schemaSnapshot";

/**
 * Two halves, because deleting a journey can go wrong in two unrelated ways.
 *
 * The first is what the user is told. Three screens once ran these statements
 * inline and read no result, so a guest pressing "Delete permanently" had all
 * three refused by RLS, the dialog closed, and the journey was still there
 * with no word said (UX audit, Sept 2026).
 *
 * The second is what gets left behind. Most tables that point at a trip are
 * ON DELETE CASCADE and clean themselves up; `cards` and `days` are NO ACTION
 * and must be deleted by hand, in that order, because cards also point at
 * days. Nothing warns you when a new table joins that list — so this does.
 */

// A Supabase double that records the calls and returns what it is told to.
function fakeClient(results: Record<string, { error?: unknown; data?: unknown }>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            eq() {
              calls.push(table);
              const r = results[table] ?? { error: null, data: [{ id: "t" }] };
              return {
                ...r,
                error: r.error ?? null,
                select: () => ({ ...r, error: r.error ?? null }),
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("deleteJourney — what the user is told", () => {
  it("says nothing when it worked", async () => {
    const { client } = fakeClient({});
    expect(await deleteJourney(client, "t1")).toBeNull();
  });

  it("does not claim success when RLS silently refuses the trip", async () => {
    // No error, zero rows — the shape that made three screens lie.
    const { client } = fakeClient({ trips: { error: null, data: [] } });
    expect(await deleteJourney(client, "t1")).toBe("This journey isn't yours to delete.");
  });

  it("reports a failure on the cards delete and stops there", async () => {
    const { client, calls } = fakeClient({ cards: { error: { message: "denied" } } });
    expect(await deleteJourney(client, "t1")).toBe("Couldn't delete this journey. Try again.");
    expect(calls).toEqual(["cards"]); // days and trips are never attempted
  });

  it("reports a failure on the days delete", async () => {
    const { client, calls } = fakeClient({ days: { error: { message: "denied" } } });
    expect(await deleteJourney(client, "t1")).toBe("Couldn't delete this journey. Try again.");
    expect(calls).toEqual(["cards", "days"]);
  });

  it("deletes cards before days before the trip", async () => {
    // cards.day_id references days, so the reverse order fails on a real
    // database. The order is load-bearing, not stylistic.
    const { client, calls } = fakeClient({});
    await deleteJourney(client, "t1");
    expect(calls).toEqual(["cards", "days", "trips"]);
  });
});

describe("deleteJourney — what gets left behind", () => {
  const source = readFileSync(path.join(__dirname, "deleteJourney.ts"), "utf8");

  it("deletes by hand every child the database will not cascade", () => {
    const manual = TRIP_CHILDREN.filter((c) => c.onDelete === "NO ACTION" || c.onDelete === "RESTRICT");
    const missed = manual.filter((c) => !source.includes(`from("${c.table}")`));
    expect(
      missed.map((c) => c.table),
      missed.length
        ? `\n  These point at trips with ON DELETE ${missed[0].onDelete} and nothing removes them:\n` +
          missed.map((c) => `    ${c.table}.${c.column}`).join("\n") +
          `\n  Either add a delete to deleteJourney.ts or make the constraint CASCADE.\n`
        : "",
    ).toEqual([]);
  });

  it("still knows about every child table", () => {
    // If a migration adds a table pointing at trips and the snapshot is
    // refreshed, this suite starts covering it automatically. If the snapshot
    // is NOT refreshed, this is the reminder.
    expect(TRIP_CHILDREN.length).toBeGreaterThanOrEqual(11);
    expect(TRIP_CHILDREN.map((c) => c.table)).toContain("cards");
    expect(TRIP_CHILDREN.map((c) => c.table)).toContain("days");
  });

  it("leaves places alone, deliberately", () => {
    // places are a user-level library shared across journeys — cards point at
    // them with RESTRICT, and a place outliving the journey is correct, not a
    // leak. Recorded so nobody 'fixes' it into deleting someone's saved places.
    expect(source).not.toContain('from("places")');
  });
});
