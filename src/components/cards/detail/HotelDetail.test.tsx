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

  it("both ends read as a date and a time, and check-out counts the nights (Don, Nov 2026)", () => {
    const c = { ...hotel({ check_out: "2027-07-19" }), start_time: "15:00:00", end_time: "11:00:00" } as Card;
    render(<HotelDetail card={c} onSaveDetails={vi.fn()} checkInDay="2027-07-16" />);
    expect(screen.getByTestId("checkin-value").textContent).toBe("Fri 16 Jul · 3:00 PM");
    expect(screen.getByTestId("checkout-value").textContent).toBe("Mon 19 Jul · 11:00 AM");
    expect(screen.getByText("Check-out · 3 nights")).toBeTruthy();
    // The time rides on the check-out row; no second "Check-out time" row.
    expect(screen.queryByText("Check-out time")).toBeNull();
  });

  it("one night says night; no day known keeps the check-in time alone", () => {
    render(<HotelDetail card={hotel({ check_out: "2027-07-17" })} onSaveDetails={vi.fn()} checkInDay="2027-07-16" />);
    expect(screen.getByText("Check-out · 1 night")).toBeTruthy();
    cleanup();
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} />);
    expect(screen.getByTestId("checkin-value").textContent).toBe("2:00 PM");
    expect(screen.getByText("Check-out")).toBeTruthy();
  });

  it("the Check-in row opens the time sheet, since a hotel has no time chip (17 Nov 2026)", () => {
    const edit = vi.fn();
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} checkInDay="2027-07-16" onEditTime={edit} />);
    fireEvent.click(screen.getByLabelText("Change the check-in and check-out times"));
    expect(edit).toHaveBeenCalled();
    cleanup();
    render(<HotelDetail card={hotel({})} />);
    expect(screen.queryByLabelText("Change the check-in and check-out times")).toBeNull();
  });

  it("the check-out picker starts at the check-in day, not today (Don, Nov 2026)", () => {
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} checkInDay="2027-07-16" />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).min).toBe("2027-07-16");
    cleanup();
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).min).toBe("");
  });
  it("shows the day already written and saves a new one as check_out", () => {
    const save = vi.fn();
    render(<HotelDetail card={hotel({ check_out: "2026-07-26" })} onSaveDetails={save} />);
    const input = screen.getByLabelText("Check-out day") as HTMLInputElement;
    expect(input.value).toBe("2026-07-26");
    fireEvent.change(input, { target: { value: "2026-07-27" } });
    expect(save).toHaveBeenCalledWith("check_out", "2026-07-27");
  });

  it("shows the day the week's band shows when none is written (Tuscany's villa)", () => {
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} stayCheckOut="2027-09-04" />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).value).toBe("2027-09-04");
    // Check-in reads first; rows, not uppercase labels (16 Nov 2026).
    const text = screen.getByTestId("hotel-stay").textContent ?? "";
    expect(text.indexOf("Check-in")).toBeLessThan(text.indexOf("Check-out"));
    expect(screen.getByTestId("checkout-value").textContent).toBe("Sat 4 Sept");
  });

  it("an unset check-out says 'Add a date', not an empty yyyy-mm-dd box (16 Nov 2026)", () => {
    render(<HotelDetail card={hotel({})} onSaveDetails={vi.fn()} />);
    expect(screen.getByTestId("checkout-value").textContent).toBe("Add a date");
    // The phone's own date picker still opens: the input sits over the row, invisible.
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).className).toContain("opacity-0");
  });

  it("reads Santa Barbara's check_out_date", () => {
    render(<HotelDetail card={hotel({ check_out_date: "2026-10-12" })} onSaveDetails={vi.fn()} />);
    expect((screen.getByLabelText("Check-out day") as HTMLInputElement).value).toBe("2026-10-12");
  });

  it("says the note shows on the shared link, to the owner only (2 Oct 2026)", () => {
    render(<HotelDetail card={hotel({ notes: "Check in from 4pm. Wi-Fi: ZambaldiGuest" })} onSaveDetails={vi.fn()} />);
    expect(screen.getByTestId("hotel-note-shared").textContent).toBe("Shows on the shared link. Keep door codes in Journey notes.");
    cleanup();
    render(<HotelDetail card={hotel({ notes: "Check in from 4pm." })} />);
    expect(screen.queryByTestId("hotel-note-shared")).toBeNull();
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
