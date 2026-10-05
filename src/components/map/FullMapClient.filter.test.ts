import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// 5 Oct 2026: the desktop Map tab's sidebar ("the old legend") is retired; the
// Filter pill is the one control on every screen, as on the week's map.
const src = readFileSync(join(__dirname, "FullMapClient.tsx"), "utf8");

describe("Map tab filter", () => {
  it("renders no sidebar", () => {
    expect(src).not.toMatch(/<MapSidebar\b/);
    expect(src).not.toMatch(/<aside\b/);
  });

  it("shows the Filter on desktop for owners too", () => {
    const filterRow = /className="absolute left-3 flex flex-col gap-2"/;
    expect(src, "the Filter row must not carry md:hidden").toMatch(filterRow);
  });
});
