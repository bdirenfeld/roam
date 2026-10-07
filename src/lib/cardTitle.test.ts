import { describe, it, expect } from "vitest";
import { cardTitle, deletedToast, UNTITLED_NOTE } from "./cardTitle";

describe("a card's name (6 Oct 2026, delight audit)", () => {
  it("the place's title first", () => {
    expect(cardTitle({ place: { title: "Uffizi Gallery" }, details: { title: "Museum" } })).toBe("Uffizi Gallery");
  });

  it("then the card's own title, then the start of the note", () => {
    expect(cardTitle({ place: null, details: { title: "Pack the car" } })).toBe("Pack the car");
    expect(cardTitle({ place: null, details: { notes: "Call Nonna about Sunday lunch" } })).toBe("Call Nonna about Sunday lunch");
  });

  it("an empty note is 'A note', never '(untitled note)'", () => {
    expect(cardTitle({ place: null, details: {} })).toBe(UNTITLED_NOTE);
    expect(UNTITLED_NOTE).toBe("A note");
  });
});

describe("the delete toast names what went", () => {
  it("says 'Deleted' and the name, never 'Card deleted'", () => {
    expect(deletedToast({ place: { title: "Uffizi Gallery" } })).toBe("Deleted Uffizi Gallery");
    expect(deletedToast({ place: null, details: {} })).toBe("Deleted a note"); // as the week board says it
    expect(deletedToast({ place: { title: "X" } })).not.toMatch(/Card deleted/);
  });

  it("cuts a long name so the pill stays one line", () => {
    const t = deletedToast({ place: null, details: { notes: "a".repeat(60) } });
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual("Deleted ".length + 40);
  });
});
