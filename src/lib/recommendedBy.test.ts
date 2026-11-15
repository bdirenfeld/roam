import { describe, it, expect } from "vitest";
import { readRecommendedBy, isRecommended, recommendedByLine } from "./recommendedBy";

describe("recommendedBy", () => {
  it("reads a trimmed name", () => {
    expect(readRecommendedBy({ recommended_by: "  Gorav " })).toBe("Gorav");
  });
  it("treats blank, missing and non-string as no recommender", () => {
    for (const d of [null, undefined, "x", {}, { recommended_by: "" }, { recommended_by: "   " }, { recommended_by: 3 }]) {
      expect(readRecommendedBy(d)).toBeNull();
      expect(isRecommended(d)).toBe(false);
    }
  });
  it("isRecommended is true for a real name (the Recommended pill)", () => {
    expect(isRecommended({ recommended_by: "TikTok" })).toBe(true);
  });
  it("writes the one phrasing", () => {
    expect(recommendedByLine("Rita")).toBe("via Rita");
  });
});
