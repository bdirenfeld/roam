import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A ratchet, not a coverage target.
 *
 * On 7 Sept 2026 the test suite was built in the morning, on the rule "write the
 * test that would have failed before the fix". By the evening four more changes
 * had shipped — including two new pure functions, `plainNote` and the today
 * check — with no tests at all. Nothing failed, because nothing was watching.
 * Brennan asked for something that stops it happening again, and a line in a
 * checklist had already proved it does not.
 *
 * So: every module under src/lib that exports a function needs a sibling
 * `.test.ts`. The 44 that already existed without one are listed below and
 * grandfathered. A NEW module cannot join that list by accident — you have to
 * open this file and type its name, which is a decision rather than an
 * oversight.
 *
 * The list only shrinks. Writing tests for something on it makes the second
 * test here fail until you delete the line, which is the point.
 *
 * Its companion rule, in roam-ship: pure logic goes in src/lib. `plainNote`
 * lived inside a component, where this check could never have seen it.
 */

const LIB = path.resolve(__dirname);

/** Modules that predate the ratchet. Only ever remove lines from this list. */
const GRANDFATHERED = new Set([
  "api/guard.ts",
  "attachmentCount.ts",
  "auth-actions.ts",
  "autoDayTitle.ts",
  "budget/currency.ts",
  "budget/load.ts",
  "budget/model.ts",
  "companion/prompt.ts",
  "companion/skeleton.ts",
  "countries.ts",
  "entry/types.ts",
  "formatTime.ts",
  "mapPins.ts",
  "newJourneySeed.ts",
  "offline/queuedWrite.ts",
  "offline/writeQueue.ts",
  "openingHours.ts",
  "places/fetchDetails.ts",
  "places/inferType.ts",
  "places/photoCache.ts",
  "places/predictions.ts",
  "planWeeks.ts",
  "priceRange.ts",
  "recommendedBy.ts",
  "sampleTrip/actions.ts",
  "scheduleCard.ts",
  "share-actions.ts",
  "stripe/server.ts",
  "subTypeLabel.ts",
  "supabase/admin.ts",
  "supabase/client.ts",
  "supabase/middleware.ts",
  "supabase/server.ts",
  "trip-access-client.ts",
  "trip-access.ts",
  "tripArchive.ts",
  "tripRecency.ts",
  "unsplash.ts",
  "wishlist/climate.ts",
  "wishlist/pinToJourney.ts",
  "yearView/bugSeasons.ts",
  "yearView/hci.ts",
  "yearView/openWindows.ts",
  "yearView/stormSeasons.ts",
]);

function libModules(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(dir, entries[i]);
    if (statSync(full).isDirectory()) libModules(full, out);
    else if (/\.ts$/.test(entries[i]) && !/\.test\.ts$/.test(entries[i])) out.push(full);
  }
  return out;
}

/** Exports something callable — a type-only or constants file needs no test. */
function exportsAFunction(text: string): boolean {
  return /^export\s+(async\s+)?function\s/m.test(text) ||
         /^export\s+const\s+[A-Za-z0-9_]+\s*=\s*(async\s*)?(\([^)]*\)|[A-Za-z0-9_]+)\s*(:[^=]+)?=>/m.test(text);
}

function rel(file: string): string {
  return path.relative(LIB, file).replace(/\\/g, "/");
}

function classify() {
  const untested: string[] = [];
  const nowTested: string[] = [];
  for (const file of libModules(LIB)) {
    const name = rel(file);
    if (!exportsAFunction(readFileSync(file, "utf8"))) continue;
    const hasTest = existsSync(file.replace(/\.ts$/, ".test.ts"));
    if (hasTest) {
      if (GRANDFATHERED.has(name)) nowTested.push(name);
    } else if (!GRANDFATHERED.has(name)) {
      untested.push(name);
    }
  }
  return { untested, nowTested };
}

describe("new logic in src/lib arrives with tests", () => {
  it("has no untested module that is not grandfathered", () => {
    const { untested } = classify();
    expect(
      untested,
      untested.length
        ? `\n  These export a function and have no sibling .test.ts:\n` +
          untested.map((n) => `    src/lib/${n}`).join("\n") +
          `\n\n  Write the test that would fail without the code. If it genuinely\n` +
          `  cannot be tested, add it to GRANDFATHERED in this file and say why\n` +
          `  in the commit — that way it is a decision, not an oversight.\n`
        : "",
    ).toEqual([]);
  });

  it("keeps the grandfathered list honest", () => {
    // Something on the list has grown a test. Delete its line — a list that
    // never shrinks stops meaning anything.
    const { nowTested } = classify();
    expect(
      nowTested,
      nowTested.length
        ? `\n  Now tested, so remove from GRANDFATHERED:\n` +
          nowTested.map((n) => `    "${n}",`).join("\n") + "\n"
        : "",
    ).toEqual([]);
  });

  it("is watching a real number of modules", () => {
    // If the scan breaks and finds nothing, both checks above pass vacuously.
    const all = libModules(LIB).filter((f) => exportsAFunction(readFileSync(f, "utf8")));
    expect(all.length).toBeGreaterThan(40);
  });
});
