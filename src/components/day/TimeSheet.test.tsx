// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card } from "@/types/database";
import TimeSheet from "./TimeSheet";

vi.mock("@/hooks/useSheetDrag", () => ({ useSheetDrag: () => ({}) }));
afterEach(cleanup);

const lunch = { id: "c", start_time: "12:30:00", end_time: "13:45:00", place: { title: "Da Nerbone" }, details: {} } as unknown as Card;

describe("the time sheet keeps a stop's length when its start moves (4 Oct 2026)", () => {
  it("lunch 12:30–1:45 moved to 1 pm becomes 1:00–2:15, not 1:00–1:45", () => {
    const { container } = render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    const [start, end] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    fireEvent.change(start, { target: { value: "1pm" } });
    expect(end.value).toBe("2:15 PM");
    expect(start.value).toBe("1pm");
  });

  it("a length the person types becomes the one kept", () => {
    const { container } = render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    const [start, end] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    fireEvent.change(end, { target: { value: "1pm" } });
    fireEvent.change(start, { target: { value: "2pm" } });
    expect(end.value).toBe("2:30 PM");
  });
});

describe("the time sheet says each thing once (6 Oct 2026, designer review)", () => {
  it("no reading under a box that already shows it; a reading under a shorthand; the button is just Done", () => {
    const { container } = render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    const [start] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(screen.queryAllByText("12:30 PM")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    fireEvent.change(start, { target: { value: "230p" } });
    expect(screen.getByText("2:30 PM")).toBeTruthy();
    expect(screen.getByText(/1h/).className).toContain("whitespace-nowrap");
  });
});

describe("one tap where one choice is enough (6 Oct 2026, taps audit)", () => {
  it("no parts of the day: the sheet is the times, Clear time and Done", () => {
    render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    for (const name of ["Morning", "Lunch", "Afternoon", "Evening", "No time"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("Clear time empties the boxes and waits for Done; Undo brings the old time back (6 Oct 2026)", () => {
    const onSave = vi.fn(); const onClose = vi.fn();
    const { container } = render(<TimeSheet card={lunch} onClose={onClose} onSave={onSave} />);
    const [start, end] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(start.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Undo · 12:30 PM" }));
    expect(start.value).toBe("12:30 PM");
    expect(end.value).toBe("1:45 PM");
    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
    cleanup();
    render(<TimeSheet card={{ ...lunch, start_time: null, end_time: null } as unknown as Card} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear time" })).toBeNull();
  });

  // Finger-sized (7 Oct 2026, re-audit).
  it("Clear time is 44px tall; − and + are 32×44; Length has the wider column so '2h 30m' clears them at 375px", () => {
    render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear time" }).className).toContain("py-3");
    for (const id of ["length-shorter", "length-longer"]) {
      const b = screen.getByTestId(id);
      expect(b.className).toContain("w-8");
      expect(b.className).toContain("h-11");
    }
    const grid = screen.getByLabelText("Start").closest(".grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]");
    // 375 − 40 (px-5) − 16 (two 8px gaps) = 319; Length gets 1.3/3.3 of it,
    // less two 32px buttons: the room "2h 30m" (~46px at 14px) has.
    const room = (319 * 1.3) / 3.3 - 2 * 32;
    expect(room).toBeGreaterThan(46 + 8);
  });
});
