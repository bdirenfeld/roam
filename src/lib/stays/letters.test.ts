import { describe, it, expect } from "vitest";
import { assignLetters } from "./letters";

describe("assignLetters", () => {
  it("a kept row keeps its letter; the rest fill in around it", () => {
    expect(assignLetters([{ prior: null }, { prior: "B" }, { prior: null }, { prior: null }])).toEqual(["A", "B", "C", "D"]);
    expect(assignLetters([{ prior: "D" }, { prior: null }, { prior: null }])).toEqual(["D", "A", "B"]);
  });
  it("two kept rows never share a letter", () => {
    expect(assignLetters([{ prior: "A" }, { prior: "A" }])).toEqual(["A", "B"]);
  });
  it("with nothing kept it is simply A, B, C", () => {
    expect(assignLetters([{ prior: null }, { prior: null }, { prior: null }])).toEqual(["A", "B", "C"]);
  });
  it("runs out honestly", () => {
    expect(assignLetters(Array.from({ length: 13 }, () => ({ prior: null }))).at(-1)).toBeNull();
  });
});
