import { describe, it, expect } from "vitest";
import { unplacedCount } from "./savedPile";

describe("unplacedCount", () => {
  it("counts only saved places with no scheduled copy", () => {
    // Montreal: Bota Bota saved, then scheduled 21 seconds later.
    expect(unplacedCount([{ place_id: "bota" }], [{ place_id: "bota" }])).toBe(0);
  });

  it("is the whole pile when nothing is on a day (Puglia: 24 saved, 0 placed)", () => {
    const saved = Array.from({ length: 24 }, (_, i) => ({ place_id: `p${i}` }));
    expect(unplacedCount(saved, [])).toBe(24);
  });

  it("counts a place saved twice once (Marina di Pescoluse, six minutes apart)", () => {
    expect(unplacedCount([{ place_id: "m" }, { place_id: "m" }, { place_id: "x" }], [])).toBe(2);
  });

  it("counts saved notes, which have no place", () => {
    expect(unplacedCount([{ place_id: null }, { place_id: "a" }], [{ place_id: "a" }])).toBe(1);
  });
});
