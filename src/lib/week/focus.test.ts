import { describe, it, expect } from "vitest";
import { weekColumns, weekMinWidth, STRIP_W, FOCUS_MIN } from "./focus";

describe("weekColumns", () => {
  it("shares the width when no day is in focus", () => {
    expect(weekColumns(52, 3, 168, -1)).toBe("52px minmax(168px, 1fr) minmax(168px, 1fr) minmax(168px, 1fr)");
  });
  it("gives the focused day the room and strips to the rest", () => {
    expect(weekColumns(52, 3, 168, 1)).toBe(`52px minmax(${STRIP_W}px, 0fr) minmax(${FOCUS_MIN}px, 1fr) minmax(${STRIP_W}px, 0fr)`);
  });
  it("always writes one track per day, so the change can animate", () => {
    for (const f of [-1, 0, 6]) expect(weekColumns(52, 7, 168, f).split(" minmax").length).toBe(8);
  });
});

describe("weekMinWidth", () => {
  it("is seven full columns, or one wide day and six strips", () => {
    expect(weekMinWidth(52, 7, 168, -1)).toBe(52 + 7 * 168);
    expect(weekMinWidth(52, 7, 168, 2)).toBe(52 + FOCUS_MIN + 6 * STRIP_W);
  });
});
