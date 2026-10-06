// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Pieces, { splitPieces } from "./Pieces";

describe("splitPieces (6 Oct 2026)", () => {
  it("breaks only between pieces; brackets and date ranges stay whole", () => {
    expect(splitPieces("2 adults · 2 seniors · 3 kids (10, 8, 5)")).toEqual(["2 adults ·", "2 seniors ·", "3 kids (10, 8, 5)"]);
    expect(splitPieces("Villa Zambaldi, 24 Aug – 4 Sep")).toEqual(["Villa Zambaldi,", "24 Aug – 4 Sep"]);
    expect(splitPieces("Travel requirements")).toEqual(["Travel requirements"]);
  });
});

describe("Pieces", () => {
  it("each piece is unbreakable and the text reads the same", () => {
    const { container } = render(<p><Pieces text="2 adults · 3 kids (10, 8, 5)" /></p>);
    expect(container.textContent).toBe("2 adults · 3 kids (10, 8, 5)");
    expect(Array.from(container.querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent)).toEqual(["2 adults ·", "3 kids (10, 8, 5)"]);
  });
});

describe("Pieces: long pieces", () => {
  it("a piece too long for a phone line wraps normally instead of overflowing", () => {
    const long = "No air conditioning in the upstairs bedrooms";
    const { container } = render(<p><Pieces text={`Pool · ${long}`} /></p>);
    expect(Array.from(container.querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent)).toEqual(["Pool ·"]);
  });
});
