import { describe, it, expect } from "vitest";
import { markChosen } from "./localState";

describe("markChosen", () => {
  const rows = [
    { id: "t1", base: 0, status: "chosen", place_id: "p1" },
    { id: "t2", base: 0, status: "candidate", place_id: null },
    { id: "o1", base: 1, status: "chosen", place_id: "p3" },
  ];
  it("choosing on Tokyo demotes Tokyo's old choice and leaves Osaka's alone", () => {
    const out = markChosen(rows, "t2", "p2");
    expect(out.map((r) => r.status)).toEqual(["saved", "chosen", "chosen"]);
    expect(out[1].place_id).toBe("p2");
  });
  it("a single-base journey (base null) behaves as base 0", () => {
    const single = [{ id: "a", base: null, status: "chosen" }, { id: "b", base: null, status: "candidate" }];
    expect(markChosen(single, "b", null).map((r) => r.status)).toEqual(["saved", "chosen"]);
  });
  it("an unknown id changes nothing", () => {
    expect(markChosen(rows, "zzz", "p9")).toBe(rows);
  });
});
