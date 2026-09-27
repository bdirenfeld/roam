import { describe, it, expect } from "vitest";
import { withDetails } from "./cardDetails";

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
