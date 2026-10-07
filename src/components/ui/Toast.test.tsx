// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
});
