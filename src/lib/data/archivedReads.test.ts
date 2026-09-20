import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every screen that shows cards must hide archived ones.
 *
 * On 19 Sep 2026 Brennan removed the Carrara quarry day from Tuscany — three
 * times — and the cards kept coming back on his phone. They had never come
 * back: archiving sets `cards.archived = true` and leaves `status` at
 * `in_itinerary`, and the Agenda, Plan and Map queries all filtered on
 * `status` alone. The delete wrote correctly every time; the three screens he
 * actually looks at simply never honoured it. Only the shared-journey page had
 * the guard, added the same day for the same bug on the same quarries.
 *
 * That defect does not exist inside any one file. It lives in the relationship
 * between a column the writer sets and a filter the readers forgot, which is
 * why reading either file looked fine. So the relationship is asserted here.
 *
 * If you add a new read of `cards` to a screen, this test tells you to guard it.
 * If a screen legitimately needs archived rows, give it its own exemption and
 * say why — do not weaken the count.
 */

const SRC = path.resolve(__dirname, "../..");

/** Screens that render cards to the traveller. */
const DISPLAY_SURFACES = [
  "app/(app)/trips/[tripId]/days/[dayId]/page.tsx",
  "app/(app)/trips/[tripId]/plan/page.tsx",
  "app/(app)/trips/[tripId]/map/page.tsx",
  "app/journey/[token]/page.tsx",
];

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

/**
 * `exec` in a loop rather than spreading `matchAll`: this project sets no
 * `target`, so TypeScript compiles it as ES5 and cannot iterate the iterator
 * matchAll returns. Same reason as layers.test.ts.
 */
function countOf(src: string, re: RegExp): number {
  let n = 0;
  while (re.exec(src) !== null) n++;
  return n;
}

describe("archived cards are filtered out of every display surface", () => {
  for (const rel of DISPLAY_SURFACES) {
    it(`${rel} guards every cards read`, () => {
      const src = read(rel);

      const reads = countOf(src, /\.from\(["']cards["']\)/g);
      const guards = countOf(src, /\.not\(\s*["']archived["']\s*,\s*["']is["']\s*,\s*true\s*\)/g);

      expect(
        reads,
        `${rel} reads the cards table but this test found none — did the file move?`,
      ).toBeGreaterThan(0);

      expect(
        guards,
        `${rel} has ${reads} read(s) of \`cards\` but only ${guards} archived guard(s). ` +
          `Archiving leaves cards.status at "in_itinerary", so an unguarded read keeps ` +
          `showing cards the traveller already removed. Add ` +
          `.not("archived", "is", true) to the unguarded query in ${rel}.`,
      ).toBe(reads);
    });
  }

  it("uses `not is true` rather than `eq false`, because older rows are null", () => {
    for (const rel of DISPLAY_SURFACES) {
      const src = read(rel);
      const wrong = countOf(src, /\.eq\(\s*["']archived["']\s*,\s*false\s*\)/g);
      expect(
        wrong,
        `${rel} filters archived with .eq("archived", false). Cards created before the ` +
          `column existed have archived = null, and PostgREST's eq drops null rows, so ` +
          `that silently hides real cards. Use .not("archived", "is", true).`,
      ).toBe(0);
    }
  });
});
