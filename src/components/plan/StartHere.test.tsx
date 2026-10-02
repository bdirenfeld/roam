// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StartHere from "./StartHere";

/** A new journey's two ways to start (1 Oct 2026, mock start-here.png). */

afterEach(cleanup);
const hotel = { day_id: "d1", status: "in_itinerary", place: { type: "logistics", sub_type: "hotel" } };
const sight = { day_id: null, status: "interested", place: { type: "activity", sub_type: "self_directed" } };

describe("Start here", () => {
  it("a new journey: both buttons, in the journey's own words, and each does its job", () => {
    const onUpload = vi.fn(), onFind = vi.fn();
    render(<StartHere cards={[]} place="Tuscany, Italy" onUpload={onUpload} onFind={onFind} floating />);
    const upload = screen.getByRole("button", { name: /Upload a booking/ });
    expect(upload.textContent).toContain("A hotel, flight or car confirmation. Roam puts it on your days.");
    expect(screen.getByRole("button", { name: /Find places/ }).textContent).toContain("Things to do and places to eat in Tuscany.");
    fireEvent.click(upload);
    fireEvent.click(screen.getByRole("button", { name: /Find places/ }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onFind).toHaveBeenCalledTimes(1);
  });

  it("the hotel uploaded: only Find places is left", () => {
    render(<StartHere cards={[hotel]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Upload a booking/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("while a booking is read, the button says so and waits", () => {
    render(<StartHere cards={[]} place="Rome, Italy" reading onUpload={vi.fn()} onFind={vi.fn()} />);
    const b = screen.getByRole("button", { name: /Reading your booking/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it("both done: nothing at all, nothing to dismiss", () => {
    const { container } = render(<StartHere cards={[hotel, sight]} place="Tuscany, Italy" onUpload={vi.fn()} onFind={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
