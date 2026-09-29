import { describe, it, expect } from "vitest";
import { notesPrompt, parseNotes, dayHoursLine, composeNote } from "./notes";
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
