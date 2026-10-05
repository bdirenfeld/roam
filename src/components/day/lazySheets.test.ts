import { readFileSync } from "fs";
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
