// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RepeatDaysOverlay from "./RepeatDaysOverlay";
import type { Day } from "@/types/database";

afterEach(cleanup);

// A two-month summer from Thursday 1 July 2027, as the app holds it.
const days = Array.from({ length: 62 }, (_, i) => {
  const date = new Date(Date.parse("2027-07-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `d${i + 1}`, trip_id: "t", date, day_number: i + 1 } as unknown as Day;
});

describe("Repeat on", () => {
  it("a camp's weekdays in a few taps: Mon–Fri on two weeks is ten days", () => {
    const onConfirm = vi.fn();
    render(<RepeatDaysOverlay days={days} currentDayId="d5" onConfirm={onConfirm} onClose={() => {}} />);
    const weekButtons = screen.getAllByRole("button", { name: "Mon–Fri" });
    fireEvent.click(weekButtons[1]); // week of 5 Jul: Mon 5 is the card's own day, so four
    fireEvent.click(weekButtons[2]); // week of 12 Jul: five
    const go = screen.getByRole("button", { name: "Copy to 9 days" });
    fireEvent.click(go);
    const picked = (onConfirm.mock.calls[0][0] as Day[]).map((d) => d.date);
    expect(picked).toHaveLength(9);
    expect(picked).not.toContain("2027-07-05");
    expect(picked.every((d) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; })).toBe(true);
  });
  it("Mon–Fri again clears the week, and nothing picked says so", () => {
    render(<RepeatDaysOverlay days={days} onConfirm={() => {}} onClose={() => {}} />);
    const wk = screen.getAllByRole("button", { name: "Mon–Fri" })[1];
    fireEvent.click(wk); fireEvent.click(wk);
    expect(screen.getByRole("button", { name: "Pick the days" })).toHaveProperty("disabled", true);
  });
});
