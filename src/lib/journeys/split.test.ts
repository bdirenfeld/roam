import { describe, it, expect } from "vitest";
import { LEFT_MIN, MAP_MIN, YEAR_STRIP_MIN, clampMapWidth, readMapWidth, yearHasRoom } from "./split";

describe("the seam between the journeys and the map", () => {
  it("the map is as wide as the pointer says, inside the limits", () => {
    expect(clampMapWidth(1920, 900)).toBe(900);
    expect(clampMapWidth(1920, 899.6)).toBe(900);
  });

  it("never narrower than the map's minimum", () => {
    expect(clampMapWidth(1920, 100)).toBe(MAP_MIN);
    expect(clampMapWidth(1920, -50)).toBe(MAP_MIN);
  });

  it("never so wide that the journeys lose their column", () => {
    expect(clampMapWidth(1920, 1900)).toBe(1920 - LEFT_MIN);
    expect(clampMapWidth(1280, 1279)).toBe(1280 - LEFT_MIN);
  });

  it("a window too small for both keeps the map at its minimum", () => {
    expect(clampMapWidth(700, 600)).toBe(MAP_MIN);
  });

  it("a remembered width is used only when it is a sane number", () => {
    expect(readMapWidth("900")).toBe(900);
    expect(readMapWidth(String(MAP_MIN))).toBe(MAP_MIN);
    expect(readMapWidth("120")).toBeNull();
    expect(readMapWidth("wide")).toBeNull();
    expect(readMapWidth("")).toBeNull();
    expect(readMapWidth(null)).toBeNull();
  });
});

describe("Your year picks its shape from its own width", () => {
  it("the strip from 640px, the list of free dates below it", () => {
    expect(yearHasRoom(YEAR_STRIP_MIN)).toBe(true);
    expect(yearHasRoom(988)).toBe(true); // the old centred column
    expect(yearHasRoom(YEAR_STRIP_MIN - 1)).toBe(false);
    expect(yearHasRoom(358)).toBe(false); // a phone
  });
});
