import { describe, it, expect } from "vitest";
import { plainNote } from "./plainNote";

/**
 * Every input below is a real note from the database, or the exact shape of
 * one. The point of this function is that a guest reads the note instead of
 * reading the asterisks around it, so the failure mode is cosmetic and silent —
 * nothing throws, it just looks broken on someone else's phone.
 */

describe("plainNote — the syntax that actually gets typed", () => {
  it("unwraps a bold heading", () => {
    // The Rome cards are all written this way.
    expect(plainNote("**Intent**\nA guided 3-hour walk through the Colosseum."))
      .toBe("Intent\nA guided 3-hour walk through the Colosseum.");
  });

  it("unwraps bold in the middle of a sentence", () => {
    expect(plainNote("Be at the airport by **11:00**, no later."))
      .toBe("Be at the airport by 11:00, no later.");
  });

  it("strips a markdown heading", () => {
    // Tuscany's journey note opens "## Grocery list".
    expect(plainNote("## Grocery list\nStock up on the way in from Pisa.")).
      toBe("Grocery list\nStock up on the way in from Pisa.");
  });

  it("turns bullets into something readable", () => {
    expect(plainNote("- Pane toscano\n- Schiacciata")).toBe("• Pane toscano\n• Schiacciata");
  });

  it("turns checkboxes into bullets without leaving the brackets", () => {
    // The grocery list is written as "- [ ] item". Getting the order of the two
    // bullet rules wrong yields "• [ ] Cornetti", which is worse than the raw
    // markdown.
    expect(plainNote("- [ ] Cornetti for the first morning\n- [x] Grissini"))
      .toBe("• Cornetti for the first morning\n• Grissini");
  });

  it("handles asterisk bullets too", () => {
    expect(plainNote("* Pool\n* Playground")).toBe("• Pool\n• Playground");
  });

  it("collapses a run of blank lines to one", () => {
    expect(plainNote("First block.\n\n\n\nSecond block.")).toBe("First block.\n\nSecond block.");
  });

  it("keeps a single blank line, because the notes are written in blocks", () => {
    expect(plainNote("Intent\n\nKnow before you go")).toBe("Intent\n\nKnow before you go");
  });

  it("trims the ends", () => {
    expect(plainNote("\n\n  Land, collect the van.  \n\n")).toBe("Land, collect the van.");
  });
});

describe("plainNote — what it deliberately leaves alone", () => {
  it("leaves an ordinary note untouched", () => {
    const note = "OPENING. Land, collect the van and three car seats. Nothing else planned today on purpose.";
    expect(plainNote(note)).toBe(note);
  });

  it("does not eat a lone asterisk", () => {
    expect(plainNote("Open 9–5 * closed Sundays")).toBe("Open 9–5 * closed Sundays");
  });

  it("does not treat a mid-sentence hyphen as a bullet", () => {
    const note = "Pisa is about 45 minutes - so 8:45 out gives an hour at the airport.";
    expect(plainNote(note)).toBe(note);
  });

  it("does not strip a hash that is not a heading", () => {
    expect(plainNote("Ask for table #4")).toBe("Ask for table #4");
  });

  it("leaves a URL alone", () => {
    const note = "Book at https://example.com/tickets — sells out for break week.";
    expect(plainNote(note)).toBe(note);
  });

  it("survives an empty note", () => {
    expect(plainNote("")).toBe("");
  });

  it("handles a real multi-section note end to end", () => {
    const raw = [
      "**Intent**",
      "A 3-hour guided tour of the Vatican Museums.",
      "",
      "**Know before you go**",
      "- The 8 AM start is the single most important logistics call of the trip.",
      "- [ ] Book by November.",
    ].join("\n");
    expect(plainNote(raw)).toBe([
      "Intent",
      "A 3-hour guided tour of the Vatican Museums.",
      "",
      "Know before you go",
      "• The 8 AM start is the single most important logistics call of the trip.",
      "• Book by November.",
    ].join("\n"));
  });
});
