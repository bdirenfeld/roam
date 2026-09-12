import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The stacking order of the map screen, checked rather than remembered.
 *
 * On 11 Sept 2026 the app menu opened underneath the Where-to-stay sheet.
 * The menu's own z-index was raised to 80 and it changed nothing, because the
 * menu lives INSIDE the header and the header was pinned at z-30: a child
 * cannot escape its parent's stacking context, so the whole header — menu
 * included — painted at layer 30 while the sheet sat at 60.
 *
 * That is not a bug you can see by reading one file. It only exists in the
 * relationship BETWEEN two files, which is exactly the kind nobody checks and
 * exactly the kind Brennan keeps finding. So the relationship is asserted
 * here, in the only place that can see both.
 *
 * If you move a layer, this test tells you what else has to move.
 */

const SRC = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

/** The highest z-index in a file — the layer that file paints on. */
function layerOf(rel: string): number {
  const src = read(rel);
  // `exec` in a loop rather than spreading `matchAll`: this project sets no
  // `target`, so TypeScript compiles it as ES5 and cannot iterate the
  // iterator matchAll returns. Vitest transpiles with esbuild and never
  // noticed — `tsc --noEmit` in the checks workflow did.
  const found: number[] = [];
  const re = /\bz-\[(\d+)\]|\bz-(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const n = Number(m[1] !== undefined ? m[1] : m[2]);
    if (Number.isFinite(n)) found.push(n);
  }
  expect(found.length, `${rel} declares no z-index`).toBeGreaterThan(0);
  return Math.max.apply(null, found);
}

const HEADER = "components/ui/JourneyHeader.tsx";
const SHEET = "components/map/WhereToStaySheet.tsx";
const CARD = "components/map/StayCardSheet.tsx";
const MENU = "components/ui/AppMenu.tsx";

describe("the map screen's stacking order", () => {
  it("puts the header ABOVE the sheet, because the menu lives inside the header", () => {
    // This is the assertion that would have caught it. Raising the menu was
    // useless; the header is what had to move.
    expect(layerOf(HEADER), "JourneyHeader must sit above WhereToStaySheet")
      .toBeGreaterThan(layerOf(SHEET));
  });

  it("puts the full-screen card above the header, because it is a modal", () => {
    expect(layerOf(CARD), "StayCardSheet must cover the header")
      .toBeGreaterThan(layerOf(HEADER));
  });

  it("keeps the menu inside its header's layer, so its own number cannot save it", () => {
    // A reminder in test form: the menu's z-index is meaningless against
    // anything outside the header. If someone raises it expecting a fix, this
    // says where to look instead.
    const menu = layerOf(MENU);
    const header = layerOf(HEADER);
    expect(menu, `AppMenu at z-${menu} cannot escape JourneyHeader at z-${header}; raise the HEADER`)
      .toBeLessThanOrEqual(header);
  });

  it("leaves a gap between layers, so the next thing has somewhere to go", () => {
    const sheet = layerOf(SHEET);
    const header = layerOf(HEADER);
    const card = layerOf(CARD);
    expect(header - sheet, "header and sheet are adjacent; nothing can sit between them").toBeGreaterThanOrEqual(5);
    expect(card - header, "card and header are adjacent").toBeGreaterThanOrEqual(5);
  });
});
