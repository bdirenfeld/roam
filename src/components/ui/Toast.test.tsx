// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast, type ToastOptions } from "./Toast";

// The toast's generic action button (7 Oct 2026, eve of departure), and Undo unchanged.
function Host({ opts }: { opts: ToastOptions }) {
  const { toast } = useToast();
  return <button type="button" onClick={() => toast(opts)}>show</button>;
}

function show(opts: ToastOptions) {
  render(<ToastProvider><Host opts={opts} /></ToastProvider>);
  fireEvent.click(screen.getByText("show"));
}

describe("Toast", () => {
  it("an action toast shows its button; a tap runs it once and closes the toast", () => {
    const onClick = vi.fn();
    show({ message: "Lisbon tomorrow · 2 still to book", action: { label: "Bookings", onClick } });
    expect(screen.getByRole("status").textContent).toContain("Lisbon tomorrow · 2 still to book");
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("an action toast lives 6 s, like Undo", () => {
    vi.useFakeTimers();
    try {
      show({ message: "x", action: { label: "Bookings", onClick: () => {} } });
      act(() => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByRole("status")).not.toBeNull();
      act(() => { vi.advanceTimersByTime(2100); });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Undo is unchanged, and wins over an action: one button per toast", async () => {
    const undo = vi.fn();
    const onClick = vi.fn();
    show({ message: "Deleted Uffizi", undo, action: { label: "Bookings", onClick } });
    expect(screen.queryByRole("button", { name: "Bookings" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a plain notice has no button", () => {
    show({ message: "Saved" });
    expect(screen.getByRole("status").querySelector("button")).toBeNull();
  });

  // Pile-up (7 Oct 2026, re-audit): on a journey's eve the "joined" toast and the
  // eve toast arrive together; the second used to replace the first, lost for good.
  describe("a waiting toast", () => {
    function Two({ first, second }: { first: ToastOptions; second: ToastOptions }) {
      const { toast } = useToast();
      return <button type="button" onClick={() => { toast(first); toast(second); }}>both</button>;
    }

    it("waits for the one on screen to go, then shows: both are seen", () => {
      vi.useFakeTimers();
      try {
        render(<ToastProvider><Two
          first={{ message: "Isha joined Lisbon", duration: 5000, wait: true }}
          second={{ message: "Lisbon tomorrow · 2 still to book", action: { label: "Bookings", onClick: () => {} }, wait: true }}
        /></ToastProvider>);
        fireEvent.click(screen.getByText("both"));
        expect(screen.getByRole("status").textContent).toContain("Isha joined Lisbon");
        act(() => { vi.advanceTimersByTime(5100); });
        expect(screen.getByRole("status").textContent).toContain("Lisbon tomorrow · 2 still to book");
        act(() => { vi.advanceTimersByTime(6100); });
        expect(screen.queryByRole("status")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows at once when nothing is on screen", () => {
      show({ message: "Isha joined Lisbon", wait: true });
      expect(screen.getByRole("status").textContent).toContain("Isha joined Lisbon");
    });

    it("a toast someone's tap caused still replaces at once", () => {
      render(<ToastProvider><Two first={{ message: "Isha joined Lisbon", wait: true }} second={{ message: "Deleted Uffizi", undo: () => {} }} /></ToastProvider>);
      fireEvent.click(screen.getByText("both"));
      expect(screen.getByRole("status").textContent).toContain("Deleted Uffizi");
    });
  });
});

// Phone harness (7 Oct 2026): the toast covered the Bookings sheet's "Book 2 on
// Kayak", and a long notice wrapped to four lines in half the screen's width.
describe("Toast placement on a phone", () => {
  const realEFP = (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
  const size = (w: number, h: number) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
  };
  /** A fixed z-70 layer with a bottom panel `panelH` tall, the way every sheet is built. */
  function mountSheet(panelH: number) {
    const layer = document.createElement("div");
    layer.style.position = "fixed";
    layer.style.zIndex = "70";
    Object.defineProperty(layer, "offsetHeight", { configurable: true, value: 812 });
    const panel = document.createElement("div");
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: panelH });
    const footer = document.createElement("button");
    footer.textContent = "Book 2 on Kayak";
    Object.defineProperty(footer, "offsetHeight", { configurable: true, value: 48 });
    panel.appendChild(footer);
    layer.appendChild(panel);
    document.body.appendChild(layer);
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [footer, panel, layer];
    return layer;
  }
  afterEach(() => {
    (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint = realEFP;
    document.querySelectorAll("[style*='z-index: 70']").forEach((n) => n.remove());
    size(1024, 768);
  });

  it("the toast uses the full width minus 16px gutters, centred — not the right half", () => {
    show({ message: "Lisbon tomorrow · 2 still to book", action: { label: "Bookings", onClick: () => {} } });
    const lane = screen.getByTestId("toast-lane");
    expect(lane.className).toContain("inset-x-4");
    expect(lane.className).toContain("justify-center");
    expect(lane.className).not.toContain("left-1/2");
    expect(lane.className).toContain("pointer-events-none");
    const pill = screen.getByRole("status");
    expect(pill.parentElement).toBe(lane);
    expect(pill.className).toContain("pointer-events-auto");
    expect(pill.className).toContain("max-w-[420px]");
  });

  it("no sheet open: the CSS default, no inline offset", () => {
    size(375, 812);
    show({ message: "Saved" });
    expect(screen.getByTestId("toast-lane").style.bottom).toBe("");
  });

  it("a bottom sheet open: the toast stands 8px above the sheet's top, off its footer", () => {
    size(375, 812);
    mountSheet(300);
    show({ message: "Car: booked", undo: () => {} });
    expect(screen.getByTestId("toast-lane").style.bottom).toBe(`${300 + 8}px`);
  });

  it("a near-full-height sheet: the toast goes to the top of the screen", () => {
    size(375, 812);
    mountSheet(800); // jsdom gives the pill no height, so leave no room at all
    show({ message: "Saved" });
    const lane = screen.getByTestId("toast-lane");
    expect(lane.style.top).toBe("8px");
    expect(lane.style.bottom).toBe("auto");
  });

  it("a fixed layer under z-60 (the BottomNav) is not a sheet", () => {
    size(375, 812);
    const layer = mountSheet(300);
    layer.style.zIndex = "50";
    show({ message: "Saved" });
    expect(screen.getByTestId("toast-lane").style.bottom).toBe("");
  });

  // 7 Oct 2026: removing a pin with Find open put "Removed from the map · Undo"
  // exactly over the Map's Filter / Plan my trip row, which rides above the sheet.
  it("a control marked data-toast-clear above the sheet: the toast stands above it", () => {
    size(375, 812);
    mountSheet(406);
    const row = document.createElement("div");
    row.setAttribute("data-toast-clear", "");
    row.getBoundingClientRect = () => ({ top: 366, bottom: 394, left: 12, right: 280, width: 268, height: 28, x: 12, y: 366, toJSON: () => ({}) });
    document.body.appendChild(row);
    try {
      show({ message: "Removed from the map", undo: () => {} });
      expect(screen.getByTestId("toast-lane").style.bottom).toBe(`${812 - 366 + 8}px`);
    } finally {
      row.remove();
    }
  });

  it("on a computer the toast stays under the masthead whatever is open", () => {
    size(1280, 800);
    mountSheet(300);
    show({ message: "Saved" });
    expect(screen.getByTestId("toast-lane").style.bottom).toBe("");
  });
});
