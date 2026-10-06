import { describe, it, expect } from "vitest";
import { noteLead } from "./noteLead";
import { firstSentence } from "./week/cardText";

// Notes as stored on his Tuscany cards (6 Oct 2026).
const MAFALDA = "**Intent**\nA specialist shop and eating spot in Colonnata, home of the famous cured lard.\n\n**Know before you go**\n- Cash is handy.";

describe("noteLead", () => {
  it("walks past the **Intent** heading to the first sentence", () => {
    expect(noteLead(MAFALDA)).toBe("A specialist shop and eating spot in Colonnata, home of the famous cured lard.");
  });
  it("skips markdown headings, caps labels and bullet marks", () => {
    expect(noteLead("## Intent\nCOST\n- **Lunch** only.")).toBe("Lunch only.");
  });
  it("keeps a plain note as typed", () => {
    expect(noteLead("THE FINISHER. Lucca, since 1782.")).toBe("THE FINISHER. Lucca, since 1782.");
  });
  it("is null for nothing", () => {
    expect(noteLead(null)).toBeNull();
    expect(noteLead("**Intent**\n")).toBeNull();
  });
  it("the week's opened day: first sentence of the lead, never the heading", () => {
    expect(firstSentence(noteLead(MAFALDA))).toBe("A specialist shop and eating spot in Colonnata, home of the famous cured lard.");
    expect(firstSentence(noteLead(MAFALDA))).not.toMatch(/\*\*/);
  });
});
