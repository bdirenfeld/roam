// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("@phosphor-icons/react", () => ({ CaretDown: () => null }));
import DayPicker from "./DayPicker";
import type { Day } from "@/types/database";

afterEach(cleanup);
Element.prototype.scrollIntoView = () => {};

const days = Array.from({ length: 62 }, (_, i) => {
  const date = new Date(Date.parse("2027-07-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `d${i + 1}`, date, day_number: i + 1 } as unknown as Day;
});

describe("the phone's day chip opens a calendar", () => {
  it("two months of dates, one tap to Day 47", () => {
    const onSelect = vi.fn();
    render(<DayPicker days={days} mode="active" activeDayId="d1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Day 1 of 62/ }));
    expect(screen.getByText("July 2027")).toBeTruthy();
    expect(screen.getByText("August 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Day 47, Monday 16 August/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d47" }));
  });
});
