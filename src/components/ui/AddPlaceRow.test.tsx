// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AddPlaceRow from "./AddPlaceRow";

afterEach(cleanup);

// The saved count rides on every day's Add row (23 Sep 2026) — the pile was
// invisible from any day that already had a card.
describe("AddPlaceRow", () => {
  it("shows the saved count when there is one", () => {
    render(<AddPlaceRow onClick={() => {}} hint="12 saved" />);
    expect(screen.getByRole("button").textContent).toBe("+Add a place· 12 saved");
  });
  it("is just the words when there is none", () => {
    render(<AddPlaceRow onClick={() => {}} />);
    expect(screen.getByRole("button").textContent).toBe("+Add a place");
  });
});
