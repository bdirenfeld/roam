// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card } from "@/types/database";
import HotelDetail from "./HotelDetail";

/** The hotel's sheet sets the day you leave (1 Oct 2026, lib/stays/stayRuns). */

const hotel = (details: Record<string, unknown>, dayId: string | null = "d1") =>
  ({ id: "h", day_id: dayId, start_time: "14:00:00", end_time: null, details }) as unknown as Card;

afterEach(cleanup);

describe("check-out day on the hotel's sheet", () => {
  it("shows the day already written and saves a new one as check_out", () => {
    const save = vi.fn();
    render(<HotelDetail card={hotel({ check_out: "2026-07-26" })} onSaveDetails={save} />);
    const input = screen.getByLabelText("Check-out day") as HTMLInputElement;
    expect(input.value).toBe("2026-07-26");
    fireEvent.change(input, { target: { value: "2026-07-27" } });
    expect(save).toHaveBeenCalledWith("check_out", "2026-07-27");
  });

  it("reads Santa Barbara's check_out_date", () => {
    render(<HotelDetail card={hotel({ check_out_date: "2026-10-12" })} onSaveDetails={vi.fn()} />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).value).toBe("2026-10-12");
  });

  it("offers an empty field on a booked hotel, nothing on a saved idea, and text for a guest", () => {
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).value).toBe("");
    cleanup();
    render(<HotelDetail card={hotel({}, null)} onSaveDetails={vi.fn()} />);
    expect(screen.queryByLabelText("Check-out day")).toBeNull();
    cleanup();
    render(<HotelDetail card={hotel({ check_out: "2026-07-26" })} />);
    expect(screen.queryByLabelText("Check-out day")).toBeNull();
    expect(screen.getByText(/26 Jul/)).toBeTruthy();
  });
});
