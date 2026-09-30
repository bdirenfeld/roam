import { describe, it, expect } from "vitest";
import { notesPrompt, parseNotes, dayHoursLine, composeNote, cardsNeedingNotes } from "./notes";
import { plainNote } from "@/lib/plainNote";

describe("notesPrompt", () => {
  it("lists every place by id and asks for his two headings' content", () => {
    const p = notesPrompt([{ key: "ChIJ1", title: "Galleria Borghese", subType: "self_directed", address: "Rome", types: ["museum"] }], "a family of 5 with children aged 9, 7, 4");
    expect(p).toMatch(/ChIJ1 \| Galleria Borghese/);
    expect(p).toMatch(/children aged 9, 7, 4/);
    expect(p).toMatch(/"intent"/);
  });
});

describe("parseNotes", () => {
  it("reads the JSON, fenced or bare, and drops what is unusable", () => {
    const text = '```json\n{"notes":{"a":{"intent":"Bernini and Caravaggio in a small villa.","know":["Timed entry: book weeks ahead","Bags go in the cloakroom",""]},"b":{"know":["no intent"]}}}\n```';
    expect(parseNotes(text)).toEqual({ a: { intent: "Bernini and Caravaggio in a small villa.", know: ["Timed entry: book weeks ahead", "Bags go in the cloakroom"] } });
    expect(parseNotes("sorry")).toEqual({});
  });
});

describe("dayHoursLine", () => {
  const week = ["Monday: Closed", "Tuesday: 9:00 AM – 7:00 PM", "Wednesday: 9:00 AM – 7:00 PM", "Thursday: 9:00 AM – 7:00 PM", "Friday: 9:00 AM – 7:00 PM", "Saturday: 9:00 AM – 7:00 PM", "Sunday: Open 24 hours"];
  it("the hours on the planned day, from Google", () => {
    expect(dayHoursLine(week, "2026-04-28")).toBe("Open 9:00 AM – 7:00 PM that day"); // a Tuesday
    expect(dayHoursLine(week, "2026-04-27")).toBe("Closed that day");
    expect(dayHoursLine(week, "2026-04-26")).toBe("Open 24 hours");
    expect(dayHoursLine(null, "2026-04-28")).toBeNull();
  });
});

describe("composeNote", () => {
  it("writes his house format, which the card sheet and the shared page both read", () => {
    const note = composeNote({ intent: "Bernini and Caravaggio in a small villa.", know: ["Timed entry: book weeks ahead"] }, "Open 9:00 AM – 7:00 PM that day");
    expect(note).toBe("**Intent**\nBernini and Caravaggio in a small villa.\n\n**Know before you go**\n- Timed entry: book weeks ahead\n- Open 9:00 AM – 7:00 PM that day");
    expect(plainNote(note)).toMatch(/^Intent\nBernini/);
    expect(composeNote({ intent: "A park.", know: [] }, null)).toBe("**Intent**\nA park.");
  });
});


describe("cardsNeedingNotes", () => {
  const since = "2026-09-29T22:30:00Z";
  const c = (id: string, o: Record<string, unknown> = {}) => ({ id, status: "in_itinerary", day_id: "d1", place_id: "p1", created_at: "2026-09-30T10:00:00Z", details: {}, ...o });
  it("new cards on a day with a place and no notes; nothing older, saved, or already written", () => {
    const cards = [
      c("new"),
      c("old", { created_at: "2026-09-20T10:00:00Z" }),          // his hand-built journeys
      c("saved", { status: "interested", day_id: null }),
      c("note-card", { place_id: null }),
      c("written", { details: { notes: "**Intent**\nAlready there." } }),
      c("blank", { details: { notes: "  " } }),
      c("just-made", { created_at: undefined }),
      c("hotel", { place: { type: "logistics" } }),
    ];
    expect(cardsNeedingNotes(cards, since)).toEqual(["new", "blank", "just-made"]);
  });
});

import { batchesOf, NOTES_BATCH } from "./notes";
describe("notes are written six places a call", () => {
  it("Japan's 23 cards: four calls of at most six, none lost", () => {
    const b = batchesOf(Array.from({ length: 23 }, (_, i) => i), NOTES_BATCH);
    expect(b.map((x) => x.length)).toEqual([6, 6, 6, 5]);
    expect(b.flat()).toHaveLength(23);
    expect(batchesOf([], 6)).toEqual([]);
  });
});
