import { describe, it, expect } from "vitest";
import { partyFrom, agesFrom, partySize, partyLine, hasSeniors } from "./party";

describe("who is travelling", () => {
  it("reads his trips as saved: Japan, Australia (with his mother), New York with no ages", () => {
    expect(partyFrom(5, [43, 41, 10, 8, 5])).toEqual({ adults: 2, seniors: 0, kids: [10, 8, 5] });
    expect(partyFrom(3, [41, 71, 8])).toEqual({ adults: 1, seniors: 1, kids: [8] });
    expect(partyFrom(2, null)).toEqual({ adults: 2, seniors: 0, kids: [] });
    // Tuscany: seven travelling, five ages saved — the other two are adults.
    expect(partyFrom(7, [43, 40, 10, 8, 5])).toEqual({ adults: 4, seniors: 0, kids: [10, 8, 5] });
  });
  it("writes one age per person, keeping the real ones", () => {
    const p = partyFrom(5, [43, 41, 10, 8, 5]);
    expect(agesFrom(p, [43, 41, 10, 8, 5])).toEqual([43, 41, 10, 8, 5]);
    expect(agesFrom({ ...p, seniors: 2 }, [43, 41, 10, 8, 5])).toEqual([43, 41, 70, 70, 10, 8, 5]);
    expect(agesFrom({ adults: 3, seniors: 0, kids: [4] }, null)).toEqual([40, 40, 40, 4]);
    expect(partySize({ adults: 2, seniors: 1, kids: [10, 8] })).toBe(5);
  });
  it("says it plainly, and knows a senior", () => {
    expect(partyLine({ adults: 2, seniors: 0, kids: [10, 8, 5] })).toBe("2 adults · 3 kids (10, 8, 5)");
    expect(partyLine({ adults: 1, seniors: 1, kids: [8] })).toBe("1 adult · 1 senior · 1 kid (8)");
    expect(hasSeniors([41, 71, 8])).toBe(true);
    expect(hasSeniors([43, 41])).toBe(false);
  });
});
