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
