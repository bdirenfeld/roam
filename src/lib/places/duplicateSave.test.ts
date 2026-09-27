import { describe, it, expect } from "vitest";
import { isDuplicateSave } from "./duplicateSave";

describe("isDuplicateSave", () => {
  it("the airport on Sunday is not a duplicate of the airport on Thursday", () => {
    expect(isDuplicateSave([{ day_id: "thu" }], "sun")).toBe(false);
  });
  it("the same place on the same day is", () => {
    expect(isDuplicateSave([{ day_id: "thu" }, { day_id: "sat" }], "sat")).toBe(true);
  });
  it("a second map-only save of a place already on the journey is", () => {
    expect(isDuplicateSave([{ day_id: null }], null)).toBe(true);
    expect(isDuplicateSave([{ day_id: "thu" }], null)).toBe(true);
  });
  it("a new place never is", () => {
    expect(isDuplicateSave([], "thu")).toBe(false);
    expect(isDuplicateSave([], null)).toBe(false);
  });
});
