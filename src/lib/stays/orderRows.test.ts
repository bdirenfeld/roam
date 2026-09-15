import { describe, it, expect } from "vitest";
import { orderRows } from "./orderRows";

describe("orderRows", () => {
  it("the chosen stay leads, the rest keep letter order", () => {
    const rows = [
      { status: "candidate", letter: "A" },
      { status: "saved", letter: "C" },
      { status: "chosen", letter: "F" },
      { status: "candidate", letter: "B" },
    ];
    expect(orderRows(rows).map((r) => r.letter)).toEqual(["F", "A", "B", "C"]);
  });
  it("a row with no letter goes last, and nothing is mutated", () => {
    const rows = [{ status: "candidate", letter: null }, { status: "candidate", letter: "B" }];
    const out = orderRows(rows);
    expect(out.map((r) => r.letter)).toEqual(["B", null]);
    expect(rows[0].letter).toBeNull();
  });
});
