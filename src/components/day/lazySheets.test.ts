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
