import { describe, it, expect } from "vitest";
import { costCents, spendKey, DAILY_CAP_CENTS } from "./spend";

describe("what a Claude call costs", () => {
  it("a travellers' search: tokens read and written, plus each web search", () => {
    // 40,000 tokens read, 1,500 written, 3 searches: 12¢ + 2.25¢ + 3¢.
    expect(costCents({ input_tokens: 40_000, output_tokens: 1_500, server_tool_use: { web_search_requests: 3 } })).toBeCloseTo(17.25, 2);
    // A card-notes batch: no searches.
    expect(costCents({ input_tokens: 1_200, output_tokens: 1_800 })).toBeCloseTo(3.06, 2);
    expect(costCents(null)).toBe(0);
  });
  it("one total a day, capped at three dollars", () => {
    expect(spendKey(new Date("2026-10-01T14:31:00Z"))).toBe("spend|2026-10-01");
    expect(DAILY_CAP_CENTS).toBe(300);
  });
});
