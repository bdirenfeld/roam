// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

/**
 * Plan a journey on the phone (Brennan, 2 Oct 2026, testing a new journey):
 *  - "the keyboard is so high that you can't see that it's giving you a
 *    suggestion of the place below it unless you scroll down";
 *  - "As soon as you pick your start and your end date, it automatically just
 *    presses Done. I think people need to do their start and end date and
 *    then press Done."
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Every query resolves empty: no last journey, no journeys to overlap.
vi.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const k of ["from", "select", "not", "order", "limit", "eq", "in"]) chain[k] = self;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
  return { createClient: () => chain };
});

import NewJourneyForm from "./NewJourneyForm";

const rects = new Map<string, Partial<DOMRect>>();
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ predictions: [
    { description: "Lisbon, Portugal", place_id: "gL", structured_formatting: { main_text: "Lisbon", secondary_text: "Portugal" } },
    { description: "Lisboa, Brazil", place_id: "gB", structured_formatting: { main_text: "Lisboa", secondary_text: "Brazil" } },
  ] }) })));
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const r = rects.get(this.dataset.testid ?? "");
    return (r ? { left: 0, right: 390, width: 390, x: 0, y: r.top, ...r } : realRect.call(this)) as DOMRect;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  HTMLElement.prototype.getBoundingClientRect = realRect;
  rects.clear();
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
});

function keyboardUp(height: number, offsetTop = 0) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height, offsetTop, width: 390, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
}

async function typeLisbon() {
  const input = screen.getByPlaceholderText("City, Country");
  await act(async () => { fireEvent.focus(input); fireEvent.change(input, { target: { value: "Lisb" } }); });
  await waitFor(() => expect(screen.getByTestId("dest-suggestions")).toBeTruthy(), { timeout: 2000 });
  return screen.getByTestId("dest-suggestions");
}

describe("Plan a journey", { timeout: 20000 }, () => {
  it("with the keyboard up, the destination's suggestions sit above the field, inside what can be seen", async () => {
    // A 390x844 phone: the Destination row at 276-324, the keyboard leaving 420 px.
    rects.set("dest-row", { top: 276, bottom: 324, height: 48 });
    keyboardUp(420);
    await act(async () => { render(<NewJourneyForm variant="overlay" onDismiss={vi.fn()} />); });
    const list = await typeLisbon();
    expect(list.dataset.side).toBe("above");
    expect(list.style.position === "fixed" || list.className.includes("fixed")).toBe(true);
    expect(list.style.transform).toBe("translateY(-100%)");
    expect(list.style.top).toBe("272px"); // its bottom edge 4 px above the field
    expect(list.style.maxHeight).toBe("268px"); // never taller than the space above
    expect(within(list).getByText("Lisbon")).toBeTruthy();
  });

  it("with room below (a computer, or no keyboard), the suggestions stay under the field", async () => {
    rects.set("dest-row", { top: 276, bottom: 324, height: 48 });
    keyboardUp(844);
    await act(async () => { render(<NewJourneyForm variant="overlay" onDismiss={vi.fn()} />); });
    const list = await typeLisbon();
    expect(list.dataset.side).toBe("below");
    expect(list.style.top).toBe("328px");
    expect(list.style.transform).toBe("");
  });

  it("picking the start and end dates does not close the calendar; Done does", async () => {
    await act(async () => { render(<NewJourneyForm variant="overlay" onDismiss={vi.fn()} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dates/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Next month" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "10" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "15" })); });
    // Still open, showing the range, waiting for Done.
    expect(screen.getAllByText("Select dates")).toHaveLength(2); // the sheet title and the untouched row
    expect(screen.getByText(/5 nights/)).toBeTruthy();
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(false);
    // The form's Dates row has not been filled behind the person's back.
    expect(screen.getByRole("button", { name: /Dates/ }).textContent).toContain("Select dates");
    await act(async () => { fireEvent.click(done); });
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByRole("button", { name: /Dates/ }).textContent).toMatch(/→/);
    expect(screen.getByRole("button", { name: /Dates/ }).textContent).toContain("5 nights");
  });
});
