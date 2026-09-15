import { describe, it, expect } from "vitest";
import { mapLineLabel, readMapOpen, writeMapOpen } from "./mapLine";

describe("mapLineLabel", () => {
  it("counts the places, and says nothing when there are none", () => {
    expect(mapLineLabel(3)).toBe("Map · 3 places");
    expect(mapLineLabel(1)).toBe("Map · 1 place");
    expect(mapLineLabel(0)).toBeNull();
  });
});

describe("the fold is remembered", () => {
  it("is folded until he opens it, then stays as he left it", () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readMapOpen(s)).toBe(false);
    writeMapOpen(s, true);
    expect(readMapOpen(s)).toBe(true);
    writeMapOpen(s, false);
    expect(readMapOpen(s)).toBe(false);
  });
  it("survives a storage that throws", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readMapOpen(bad)).toBe(false);
    expect(() => writeMapOpen(bad, true)).not.toThrow();
    expect(readMapOpen(null)).toBe(false);
  });
});
