// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StayDatesSheet from "./StayDatesSheet";

afterEach(cleanup);

/** The hotel picker (17 Nov 2026, approved mock): Villa Zambaldi on the Tuscany journey. */
const base = {
  title: "Villa Zambaldi",
  tripStart: "2027-08-24",
  tripEnd: "2027-09-05",
  initial: { checkIn: "2027-08-25", checkOut: "2027-09-05", start: "15:00:00", end: "11:00:00" },
  otherNights: { "2027-08-24": "Hotel Ilaria" },
  onClose: vi.fn(),
};

describe("StayDatesSheet", () => {
  it("opens on the stay: the summary, the times, and a dot on the other hotel's night", () => {
    render(<StayDatesSheet {...base} onSave={vi.fn()} />);
    expect(screen.getByTestId("stay-summary").textContent).toBe("Wed 25 Aug → Sun 5 Sept · 11 nights");
    expect(screen.getByText("August 2027")).toBeTruthy();
    expect((screen.getByLabelText("Check-in time") as HTMLInputElement).value).toBe("3:00 PM");
    expect((screen.getByLabelText("Check-out time") as HTMLInputElement).value).toBe("11:00 AM");
    expect(screen.getByLabelText("Tue 24 Aug, Hotel Ilaria that night")).toBeTruthy();
    expect(screen.getByTestId("stay-legend").textContent).toBe("Hotel Ilaria that night");
  });

  it("five hotels still fit one line under the calendar", () => {
    const many = { "2027-08-24": "A", "2027-08-26": "B", "2027-08-27": "C", "2027-08-28": "D" };
    render(<StayDatesSheet {...base} otherNights={many} onSave={vi.fn()} />);
    expect(screen.getByTestId("stay-legend").textContent).toBe("Another hotel that night");
  });

  it("tap check-in, then check-out, then Done saves both days and the typed times", () => {
    const onSave = vi.fn();
    render(<StayDatesSheet {...base} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText(/^Thu 26 Aug/));
    expect(screen.getByTestId("stay-summary").textContent).toBe("Thu 26 Aug → … · pick the day you leave");
    fireEvent.click(screen.getByLabelText(/^Mon 30 Aug/));
    fireEvent.change(screen.getByLabelText("Check-in time"), { target: { value: "4p" } });
    fireEvent.click(screen.getByText("Done"));
    expect(onSave).toHaveBeenCalledWith({ checkIn: "2027-08-26", checkOut: "2027-08-30", start: "16:00", end: "11:00" });
  });

  it("days outside the journey can't be picked", () => {
    render(<StayDatesSheet {...base} onSave={vi.fn()} />);
    expect((screen.getByLabelText(/^Mon 23 Aug/) as HTMLButtonElement).disabled).toBe(true);
  });
});
