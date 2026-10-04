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
    expect(screen.getByText(/Done · 1:00 PM – 2:15 PM/)).toBeTruthy();
  });

  it("a length the person types becomes the one kept", () => {
    const { container } = render(<TimeSheet card={lunch} onClose={vi.fn()} onSave={vi.fn()} />);
    const [start, end] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    fireEvent.change(end, { target: { value: "1pm" } });
    fireEvent.change(start, { target: { value: "2pm" } });
    expect(end.value).toBe("2:30 PM");
  });
});
