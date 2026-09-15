import { describe, it, expect } from "vitest";
import { decisionLine } from "./sheetCopy";

describe("decisionLine", () => {
  it("keeps only the sentence that is a decision", () => {
    expect(decisionLine("One base is enough. Two nights in Firenze would save 2 h 22 of driving; your call."))
      .toBe("Two nights in Firenze would save 2 h 22 of driving; your call.");
  });
  it("says nothing when there is nothing to decide", () => {
    expect(decisionLine("One base is enough.")).toBeNull();
    expect(decisionLine("Too spread out for one base. Kagoshima and 5 more sit well outside every base.")).toBeNull();
    expect(decisionLine(null)).toBeNull();
  });
});
