// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card } from "@/types/database";
import ActivityDetail from "./ActivityDetail";

// The catch-all activity layout (no kind picked, Shopping, Camp) only printed
// the cost: tapping did nothing and "Add details" offered no cost field, so
// the Estimate never counted it (7 Oct 2026, taps audit). It now uses the
// same "Cost per person" row as Tour / Explore / Event / Race / Wellness.
const card = (details: Record<string, unknown>) =>
  ({ id: "c", details, place: { type: "activity", sub_type: "shopping" } }) as unknown as Card;

afterEach(cleanup);

describe("ActivityDetail cost per person", () => {
  it("a cost from the booking can be tapped and changed", () => {
    const onSave = vi.fn();
    const { container } = render(<ActivityDetail card={card({ cost_per_person: 29, currency: "EUR" })} onSaveDetails={onSave} />);
    expect(screen.getByText("Cost per person")).toBeTruthy();
    fireEvent.click(screen.getByText("29"));
    const box = container.querySelector("input")!;
    fireEvent.change(box, { target: { value: "31.5" } });
    fireEvent.blur(box);
    expect(onSave).toHaveBeenCalledWith("cost_per_person", 31.5);
  });

  it("no cost yet: hidden while reading, an 'Add cost…' row behind Add details", () => {
    const { container, unmount } = render(<ActivityDetail card={card({})} onSaveDetails={vi.fn()} />);
    expect(container.textContent).not.toContain("Add cost");
    unmount();
    const onSave = vi.fn();
    const r = render(<ActivityDetail card={card({})} onSaveDetails={onSave} showEmpty />);
    fireEvent.click(screen.getByText("Add cost…"));
    const box = r.container.querySelector("input")!;
    fireEvent.change(box, { target: { value: "12" } });
    fireEvent.blur(box);
    expect(onSave).toHaveBeenCalledWith("cost_per_person", 12);
  });

  it("clearing the cost saves null", () => {
    const onSave = vi.fn();
    const { container } = render(<ActivityDetail card={card({ cost_per_person: 29 })} onSaveDetails={onSave} />);
    fireEvent.click(screen.getByText("29"));
    const box = container.querySelector("input")!;
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(onSave).toHaveBeenCalledWith("cost_per_person", null);
  });
});
