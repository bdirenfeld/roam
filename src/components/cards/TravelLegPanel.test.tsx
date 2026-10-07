// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TravelLegPanel, { LegFromLine } from "./TravelLegPanel";

// Finger-sized targets on the travel leg (7 Oct 2026, re-audit): the From
// control, the mode pills and "Last night's stay", without changing the look.
// Since mock t05 (same day) the From control is the quiet "change" in the
// header line, and the pills sit behind "Change how you travel".
afterEach(cleanup);

const stay = { title: "Villa Zambaldi", lat: 43.3, lng: 11.3 };
const siena = { title: "Siena", lat: 43.32, lng: 11.33 };

function panel({ from = siena as typeof siena | null, fromOpen = false, mode = "drive" as const } = {}) {
  const onModeChange = vi.fn(), onFromChange = vi.fn();
  render(<TravelLegPanel from={from} mode={mode} modeLabel="Drive" durationMins={45} suggestion={stay} fromOpen={fromOpen} onFromChange={onFromChange} onModeChange={onModeChange} />);
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
  it("with no start the line sits under an editable title, so its target reaches up 4px only", () => {
    render(<LegFromLine from={null} open={false} onToggle={vi.fn()} />);
    const t = hiddenTarget(screen.getByRole("button", { name: "Set where this starts" }));
    expect(t.className).toContain("-top-1");
    expect(t.className).not.toContain("-top-[23px]");
  });

  it("From: the header's 'change' is 44px to the finger (23px up over the plain title, 4px down to the address) and toggles the search", () => {
    const onToggle = vi.fn();
    render(<LegFromLine from={siena} open={false} onToggle={onToggle} />);
    expect(screen.getByTestId("leg-from-line").textContent).toBe("From Siena · change");
    const change = screen.getByRole("button", { name: "Change where this starts, now Siena" });
    const t = hiddenTarget(change);
    expect(t.className).toContain("-top-[23px]");
    expect(t.className).toContain("-bottom-1");
    fireEvent.click(t);
    expect(onToggle).toHaveBeenCalled();
  });

  it("'Change how you travel' is 44px to the finger and reveals the pills", () => {
    panel();
    expect(screen.queryByRole("radio")).toBeNull();
    const link = screen.getByRole("button", { name: "Change how you travel" });
    expect(hiddenTarget(link).className).toContain("-inset-y-[14px]");
    fireEvent.click(link);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("mode pills: each carries a 44px area that stays inside the row and off its neighbours", () => {
    const { onModeChange } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Change how you travel" }));
    for (const name of ["Drive", "Bus", "Train", "Ferry"]) {
      const t = hiddenTarget(screen.getByRole("radio", { name }));
      expect(t.className).toContain("-inset-y-[7px]");
      expect(t.className).toContain("-inset-x-1");
    }
    fireEvent.click(hiddenTarget(screen.getByRole("radio", { name: "Ferry" })));
    expect(onModeChange).toHaveBeenCalledWith("ferry");
    // A pick folds the pills away again; the caption says the new mode.
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("Last night's stay is at least 44px tall", () => {
    const { onFromChange } = panel({ from: null, fromOpen: true });
    const row = screen.getByRole("button", { name: /Last night/ });
    expect(row.className).toContain("min-h-[44px]");
    fireEvent.click(row);
    expect(onFromChange).toHaveBeenCalledWith(stay);
  });
});
