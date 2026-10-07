// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TravelLegPanel from "./TravelLegPanel";

// Finger-sized targets on the travel leg (7 Oct 2026, re-audit): the From
// button, the mode pills and "Last night's stay", without changing the look.
afterEach(cleanup);

const stay = { title: "Villa Zambaldi", lat: 43.3, lng: 11.3 };

function panel(onModeChange = vi.fn(), onFromChange = vi.fn()) {
  render(<TravelLegPanel from={null} to="Siena" mode="drive" durationMins={45} suggestion={stay} onFromChange={onFromChange} onModeChange={onModeChange} />);
  return { onModeChange, onFromChange };
}

function hiddenTarget(control: HTMLElement): HTMLElement {
  const t = control.querySelector("span[aria-hidden='true']") as HTMLElement;
  expect(t).toBeTruthy();
  expect(t.parentElement).toBe(control);
  expect(t.textContent).toBe("");
  expect(control.className).toContain("relative");
  return t;
}

describe("travel leg tap targets", () => {
  it("From: 28px button + 8px above and below = 44px; a tap on the area opens the search", () => {
    panel();
    const from = screen.getByRole("button", { name: "Set where this starts" });
    const t = hiddenTarget(from);
    expect(t.className).toContain("-inset-y-2");
    expect(from.className).toContain("min-h-[28px]");
    fireEvent.click(t);
    expect(screen.getByPlaceholderText("Search a town, station or port")).toBeTruthy();
  });

  it("mode pills: each carries a 44px area that stays inside the row and off its neighbours", () => {
    const { onModeChange } = panel();
    for (const name of ["Drive", "Bus", "Train", "Ferry"]) {
      const t = hiddenTarget(screen.getByRole("radio", { name }));
      expect(t.className).toContain("-inset-y-[7px]");
      expect(t.className).toContain("-inset-x-1");
    }
    fireEvent.click(hiddenTarget(screen.getByRole("radio", { name: "Ferry" })));
    expect(onModeChange).toHaveBeenCalledWith("ferry");
  });

  it("Last night's stay is at least 44px tall", () => {
    const { onFromChange } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Set where this starts" }));
    const row = screen.getByRole("button", { name: /Last night/ });
    expect(row.className).toContain("min-h-[44px]");
    fireEvent.click(row);
    expect(onFromChange).toHaveBeenCalledWith(stay);
  });
});
