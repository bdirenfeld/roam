import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Rules CLAUDE.md states in prose, stated again here where a machine can hold
 * them.
 *
 * Every rule below was written down after it had already cost a day. Prose in
 * a context file is a good record and a poor guard: it is remembered when
 * someone happens to read that paragraph, which is not the same as always.
 * Each `describe` names the rule, the failure that bought it, and — because a
 * failing test is read in a hurry — what the fix looks like.
 *
 * Written for an ES5 target like schemaContract.test.ts: no dotAll, no
 * matchAll-spreading, no spreading of iterables.
 */

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(dir, entries[i]);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entries[i]) && !/\.test\.tsx?$/.test(entries[i])) out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(SRC, file).replace(/\\/g, "/");
}

/** Line number of an offset, so a failure can be clicked. */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Strips `//` and block comments. Every rule here reads code, and all three
 * subjects — `void`, `h-full`, `start_time` — are discussed at length in the
 * comments of the very files being checked.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const FILES = sourceFiles(SRC);

// ── A query builder does nothing until something awaits it ────────────────
// `void supabase.from("t").update(...).eq(...)` sends NO request. The builder
// is lazy; it runs on `await` or `.then`. Three "changed = false" writes and
// the entry-line × were silently dead this way until 5 Sept 2026 — no error,
// no request, nothing in the network tab to notice.
//
// Fix: `.then(({ error }) => { ... })`, never `void`.
describe("a Supabase query builder does nothing until something awaits it", () => {
  it("never fires a builder chain with `void`", () => {
    const offenders: string[] = [];

    for (let i = 0; i < FILES.length; i++) {
      const text = stripComments(readFileSync(FILES[i], "utf8"));
      const re = /\bvoid\s/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        // The statement being discarded: from `void` to the first `;` that is
        // not inside the expression. A chain longer than this is not a thing
        // anyone writes on one statement.
        const tail = text.slice(m.index, m.index + 600);
        const end = tail.indexOf(";");
        const statement = end === -1 ? tail : tail.slice(0, end);
        if (/\.(from|rpc)\s*\(/.test(statement)) {
          offenders.push(rel(FILES[i]) + ":" + lineOf(text, m.index));
        }
      }
    }

    expect(
      offenders,
      "`void` on a Supabase builder sends no request at all. Use " +
        "`.then(({ error }) => …)` so the call actually runs and its refusal " +
        "is read. See CLAUDE.md, 'A Supabase query builder does nothing " +
        "until something awaits it'.",
    ).toEqual([]);
  });
});

// ── One ordering rule ─────────────────────────────────────────────────────
// A day has two readers — the owner's agenda and the read-only itinerary a
// guest opens from a share link — and they must order cards identically. They
// did not until 7 Sept 2026: the guest page kept its own copy that read
// `start_time` directly, so Rome's overnight flight sat at the BOTTOM of the
// day it lands on for everyone the journey had been shared with.
//
// Fix: import `agendaOrder` from `@/lib/agendaOrder`. Never write a second
// copy; two copies is exactly how they came to disagree.
describe("one ordering rule: lib/agendaOrder", () => {
  it("has exactly one implementation", () => {
    const defining: string[] = [];
    for (let i = 0; i < FILES.length; i++) {
      const text = stripComments(readFileSync(FILES[i], "utf8"));
      if (/function\s+agendaOrder\s*\(/.test(text)) defining.push(rel(FILES[i]));
    }
    expect(defining, "agendaOrder is defined in more than one place").toEqual([
      "lib/agendaOrder.ts",
    ]);
  });

  it("is the only comparator that reads a card's time", () => {
    const offenders: string[] = [];

    for (let i = 0; i < FILES.length; i++) {
      const file = rel(FILES[i]);
      // agendaOrder and cardTime ARE the rule; the companion prompt is prose
      // for the model, not a comparator.
      if (file === "lib/agendaOrder.ts" || file === "lib/cardTime.ts") continue;

      const text = stripComments(readFileSync(FILES[i], "utf8"));
      const re = /\.sort\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const callback = text.slice(m.index, m.index + 400);
        if (/\bstart_time\b/.test(callback) && !/sort\s*\(\s*agendaOrder\s*\)/.test(callback)) {
          offenders.push(file + ":" + lineOf(text, m.index));
        }
      }
    }

    expect(
      offenders,
      "A day's order comes from `agendaOrder`, which reads `cardTimes` — an " +
        "arriving flight is stored as when it PUSHED BACK and belongs at its " +
        "landing time. Sorting on raw `start_time` puts it at the bottom of " +
        "the day it lands on. See CLAUDE.md, 'One ordering rule'.",
    ).toEqual([]);
  });
});

// ── An overlay-hosted screen is a flex item of the card ───────────────────
// The overlay card is `h-[92dvh]` on a phone but `md:h-auto md:max-h-[86vh]`
// on a computer. A child asking for `h-full` gets 100% of an AUTO height,
// which resolves to auto: the screen grows to its content, the card clips it
// at 86vh, and the `flex-1 min-h-0 overflow-y-auto` body inside never gets a
// bound to scroll within. That was the desktop Estimate stopping at
// Contingency with no way down (fixed in a967532). The phone hid it, because
// there the card's height is real and both spellings resolve the same.
//
// Fix: `flex-1 min-h-0 flex flex-col` on the screen's root.
describe("an overlay-hosted screen is a flex item, never h-full", () => {
  /**
   * A screen hosted in `Overlay` is one that knows it can be — every one of
   * them takes `variant="overlay"`, and AppOverlays holds the inline bodies.
   * Discovering them by that token rather than by a hand-kept list means a
   * new overlay screen is covered the day it is written.
   */
  const HOSTED = FILES.filter((f) => /variant\s*(===|=)\s*"overlay"/.test(readFileSync(f, "utf8")));

  it("finds the overlay-hosted screens", () => {
    // If this drops to nothing, the discovery rule above has gone stale and
    // the real check below would pass by being empty.
    expect(HOSTED.length).toBeGreaterThanOrEqual(5);
  });

  it("never sizes a flex column with h-full", () => {
    const offenders: string[] = [];

    for (let i = 0; i < HOSTED.length; i++) {
      const text = stripComments(readFileSync(HOSTED[i], "utf8"));
      const re = /"([^"\n]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const tokens = m[1].split(/\s+/);
        let hasHFull = false;
        let column = false;
        for (let t = 0; t < tokens.length; t++) {
          if (tokens[t] === "h-full") hasHFull = true;
          // `flex-col` or `min-h-0` alongside it means this is a layout box in
          // the overlay's own column, not an `w-full h-full object-cover`
          // image filling a sized frame.
          if (tokens[t] === "flex-col" || tokens[t] === "min-h-0") column = true;
        }
        if (hasHFull && column) {
          offenders.push(rel(HOSTED[i]) + ":" + lineOf(text, m.index) + ' "' + m[1] + '"');
        }
      }
    }

    expect(
      offenders,
      "An overlay-hosted screen's root is `flex-1 min-h-0 flex flex-col`. " +
        "`h-full` resolves against the card's `md:h-auto` and collapses to " +
        "content height, so the body inside never scrolls on a desktop. See " +
        "CLAUDE.md, 'Overlay-hosted screens'.",
    ).toEqual([]);
  });
});
