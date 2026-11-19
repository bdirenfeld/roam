import { describe, it, expect } from "vitest";
import { withDetails, toStringList } from "./cardDetails";

describe("withDetails", () => {
  it("gives a card with no details an empty object", () => {
    expect(withDetails({ id: "a", details: null }).details).toEqual({});
    expect(withDetails({ id: "b" } as { id: string; details?: unknown }).details).toEqual({});
  });
  it("leaves real details alone, the same object", () => {
    const c = { id: "c", details: { notes: "book ahead" } };
    expect(withDetails(c)).toBe(c);
  });
});

describe("toStringList", () => {
  it("keeps a string array, trimmed, blanks dropped", () => {
    expect(toStringList(["Ferry to Manly", "  Swim ", ""])).toEqual(["Ferry to Manly", "Swim"]);
  });
  it("turns a stored string into one step (the Luna Park card)", () => {
    expect(toStringList("8:30–9:15 slow morning. 9:15–9:45 walk to Circular Quay.")).toEqual([
      "8:30–9:15 slow morning. 9:15–9:45 walk to Circular Quay.",
    ]);
  });
  it("splits a multi-line string into steps", () => {
    expect(toStringList("Train to Blacktown\r\nBus to the park\n\n")).toEqual(["Train to Blacktown", "Bus to the park"]);
  });
  it("returns [] for null, objects and numbers, and drops non-text items", () => {
    expect(toStringList(null)).toEqual([]);
    expect(toStringList(undefined)).toEqual([]);
    expect(toStringList({ a: 1 })).toEqual([]);
    expect(toStringList(4)).toEqual([]);
    expect(toStringList(["Walk", { card: {} }, 3])).toEqual(["Walk", "3"]);
  });
});
