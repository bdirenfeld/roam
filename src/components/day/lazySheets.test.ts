import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// Phone speed (5 Oct 2026): the booking sheets are opened rarely, so they load
// when opened instead of with every day. A static import would pull them back
// into the day page's bundle (AttachmentsPanel alone was ~168 KB).
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("booking sheets load on demand", () => {
  it.each([
    ["day/DayViewClient.tsx", "ConfirmationPreviewSheet"],
    ["day/DayViewClient.tsx", "DocumentsSheet"],
    ["cards/CardBottomSheet.tsx", "AttachmentsPanel"],
  ])("%s imports %s dynamically", (file, name) => {
    const src = read(file);
    expect(src).not.toMatch(new RegExp(`^import ${name}\\b`, "m"));
    expect(src).toContain(`const ${name} = dynamic(`);
  });
});

// 5 Oct 2026: the photo gallery's arrows sit at z 22 (above the sheet's
// gradient 20 and handle 21); a full-sheet panel at z 10 showed "Next photo"
// through the Attachments panel. Full-sheet panels must sit above the arrows.
describe("full-sheet panels cover the photo arrows", () => {
  const galleryZ = Number(/const controlZ = \{ zIndex: (\d+) \}/.exec(read("cards/PlacePhotoGallery.tsx"))![1]);
  it.each([
    ["cards/AttachmentsPanel.tsx", /absolute inset-0 z-(\d+) bg-white rounded-t-2xl/],
    ["cards/CardBottomSheet.tsx", /showLinkSheet && \(\s*<div className="absolute inset-0 z-(\d+)">/],
  ])("%s", (file, re) => {
    const z = Number(re.exec(read(file))![1]);
    expect(z, `raise the panel in ${file} above ${galleryZ}`).toBeGreaterThan(galleryZ);
  });
});

// Phone speed (5 Oct 2026): @dnd-kit (~76 KB) rode in every (app) route's
// first load because the journey notes sheet — the one thing on the phone day
// that reorders by drag — was imported statically by the app-wide overlays and
// by the day view. It loads when opened now (preloaded on idle, AppOverlays).
// This walks the static import graph from the app layout and the day page and
// fails if anything on it reaches @dnd-kit again; the message names the path.
describe("@dnd-kit stays out of the phone day's first load", () => {
  const SRC = join(__dirname, "..", "..");
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = join(from, "..", spec);
    else return null;
    for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const p = base + ext;
      if (/\.tsx?$/.test(p) && existsSync(p)) return p;
    }
    return null;
  };
  // Static value imports and re-exports only: `import type` is erased, and an
  // `import()` expression is exactly the split this test protects.
  const STATIC = /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;

  function pathToDndKit(entry: string): string[] | null {
    const seen = new Set<string>();
    const walk = (file: string, trail: string[]): string[] | null => {
      if (seen.has(file)) return null;
      seen.add(file);
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of Array.from(src.matchAll(STATIC))) {
        const spec = m[1];
        const here = [...trail, file.slice(SRC.length + 1).split("\\").join("/")];
        if (spec.startsWith("@dnd-kit/")) return [...here, spec];
        const next = resolve(file, spec);
        if (next) { const hit = walk(next, here); if (hit) return hit; }
      }
      return null;
    };
    return walk(entry, []);
  }

  it.each([
    "app/(app)/layout.tsx",
    "app/(app)/trips/[tripId]/days/[dayId]/page.tsx",
  ])("%s", (entry) => {
    const hit = pathToDndKit(join(SRC, entry));
    expect(hit, hit ? `static import chain reaches dnd-kit: ${hit.join(" -> ")}` : "").toBeNull();
  });

  it.each([
    ["day/DayViewClient.tsx", "JourneyNotesSheet"],
    ["overlays/AppOverlays.tsx", "JourneyNotesSheet"],
  ])("%s loads %s dynamically", (file, name) => {
    const src = read(file);
    expect(src).not.toMatch(new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from`, "m"));
    expect(src).toContain(`const ${name} = dynamic(`);
  });
});
