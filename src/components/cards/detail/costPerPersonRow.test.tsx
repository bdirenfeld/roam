// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { Card } from "@/types/database";
import ActivityDetail from "./ActivityDetail";
import GuidedDetail from "./GuidedDetail";
import { CostContext } from "./CostPerPersonRow";

// The shared "Cost per person" row printed a bare "29" (7 Oct 2026). The
// Estimate counts it in the destination's currency × the number paying
// (lib/budget/load.ts), so the row now says that: "€29  × 2 = €58".
const card = (details: Record<string, unknown>) =>
  ({ id: "c", details, place: { type: "activity", sub_type: "tour" } }) as unknown as Card;

const inTrip = (ui: React.ReactElement, destination: string, partySize: number) =>
  render(<CostContext.Provider value={{ destination, partySize }}>{ui}</CostContext.Provider>);

afterEach(cleanup);

describe("Cost per person row says what the Estimate counts", () => {
  it("Tuscany (EUR), 29 for a party of 2: € before the number and × 2 = €58", () => {
    const { container } = inTrip(<ActivityDetail card={card({ cost_per_person: 29 })} onSaveDetails={vi.fn()} />, "Tuscany, Italy", 2);
    expect(container.textContent).toContain("€29");
    expect(container.textContent).toContain("× 2 = €58");
  });

  it("the symbol stays in front while editing, and the save is unchanged", () => {
    const onSave = vi.fn();
    const { container, getByText } = inTrip(<GuidedDetail card={card({ cost_per_person: 29 })} onSaveDetails={onSave} />, "Tuscany, Italy", 2);
    fireEvent.click(getByText("29"));
    const box = container.querySelector("input")!;
    expect(box.parentElement!.textContent).toContain("€");
    fireEvent.change(box, { target: { value: "31.5" } });
    fireEvent.blur(box);
    expect(onSave).toHaveBeenCalledWith("cost_per_person", 31.5);
  });

  it("unknown currency: no symbol, plain multiplication", () => {
    const { container } = inTrip(<ActivityDetail card={card({ cost_per_person: 29 })} onSaveDetails={vi.fn()} />, "Somewhere odd", 2);
    expect(container.textContent).not.toMatch(/[€$£]/);
    expect(container.textContent).toContain("× 2 = 58");
  });

  it("cost_people overrides the party size; a part total keeps its cents", () => {
    const { container } = inTrip(<ActivityDetail card={card({ cost_per_person: 12.25, cost_people: 3 })} onSaveDetails={vi.fn()} />, "Tuscany, Italy", 2);
    expect(container.textContent).toContain("× 3 = €36.75");
  });
});
