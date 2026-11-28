// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://x/pass.png" } }) }) } }),
}));

import { FlightPasses } from "./FlightPass";
import { flightPass } from "@/lib/flights/pass";
import { joinFlight, withBoardingPass } from "@/lib/flights/travellers";

// 27 Nov 2026, the approved mock: one flight card, swipe through everyone's pass.
const brennan = { seat: "15E", airline: "American Airlines", flight_number: "1993", confirmation: "HHDSHC", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Dallas Fort Worth (DFW)" };
const isha = { ...brennan, seat: "15D", confirmation: "HKZZSL", notes: "Passenger: Isha Seth." };
const card = (details: Record<string, unknown>) => ({ details, start_time: "14:07:00", end_time: "16:49:00", place: null });

afterEach(cleanup);

function show(details: Record<string, unknown>, index = 0) {
  const onAddPass = vi.fn(), onOpenPass = vi.fn();
  render(<FlightPasses view={flightPass(card(details) as never, "2027-03-14")} details={details} readOnly={false} onSave={vi.fn()} onTime={vi.fn()}
    index={index} onIndex={vi.fn()} onAddPass={onAddPass} onOpenPass={onOpenPass} />);
  return { onAddPass, onOpenPass };
}

describe("the flight card's passes", () => {
  it("one person: the pass as always, no name, no dots, and a slim row to add the boarding pass", () => {
    const { onAddPass } = show(brennan);
    expect(screen.getAllByTestId("flight-pass")).toHaveLength(1);
    expect(screen.queryByTestId("pass-name")).toBeNull();
    expect(screen.queryByTestId("pass-count")).toBeNull();
    const add = screen.getByTestId("add-boarding-pass");
    expect(add.textContent).toBe("+ Add a boarding pass");
    expect(add.className).toMatch(/\bh-10\b/);
    fireEvent.click(add);
    expect(onAddPass).toHaveBeenCalledWith(0);
  });

  it("two people: a pass each with their name, seat and confirmation; whose it is under them", () => {
    show(joinFlight(brennan, isha), 1);
    const passes = screen.getAllByTestId("flight-pass");
    expect(passes).toHaveLength(2);
    expect(passes[1].textContent).toContain("Isha");
    expect(passes[1].textContent).toContain("15D");
    expect(passes[1].textContent).toContain("HKZZSL");
    expect(passes[0].textContent).toContain("HHDSHC");
    expect(screen.getByTestId("pass-count").textContent).toBe("Isha · 2 of 2");
    expect(screen.getAllByTestId("add-boarding-pass")[1].textContent).toBe("+ Add Isha's boarding pass");
  });

  it("a boarding pass shows as Tap to enlarge, and opens that person's", async () => {
    const d = withBoardingPass(joinFlight(brennan, isha), 1, { path: "t/c/pass.png", name: "pass.png", type: "image/png" });
    const { onOpenPass } = show(d, 1);
    const bp = screen.getByTestId("boarding-pass");
    expect(bp.textContent).toContain("Tap to enlarge");
    fireEvent.click(bp);
    expect(onOpenPass).toHaveBeenCalledWith(1);
  });

  // 27 Nov 2026 mock: the name is the strip's first column; Terminal sits under the time, upright.
  it('the name is the Traveller column; Terminal is under the departure, its Add not italic', () => {
    show(joinFlight(brennan, isha), 0);
    const pass = screen.getAllByTestId('flight-pass')[0];
    // Brennan's confirmation names nobody: his pass says Traveller 1 until a name is known.
    expect(pass.querySelector('[data-testid="pass-name"]')!.textContent).toBe('TravellerTraveller 1');
    expect(screen.getAllByTestId('pass-name')[1].textContent).toBe('TravellerIsha');
    const term = screen.getAllByTestId('pass-terminal')[0];
    expect(term.textContent).toBe('Terminal Add');
    expect(term.querySelector('.italic')).toBeNull();
    expect(pass.textContent).not.toMatch(/SeatTerminal/i);
  });
});

// 27 Nov 2026: "on the desktop, I can't click anywhere to swipe right to the next person's flight info".
describe("switching passes without a swipe", () => {
  it("the dots and the arrows each go to that person; the next pass does not peek", () => {
    const onIndex = vi.fn();
    const d = joinFlight(brennan, isha);
    render(<FlightPasses view={flightPass(card(d) as never, "2027-03-14")} details={d} readOnly={false} onSave={vi.fn()} onTime={vi.fn()}
      index={0} onIndex={onIndex} onAddPass={vi.fn()} onOpenPass={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId("pass-dot")[1]);
    expect(screen.getAllByTestId("pass-dot")[1].getAttribute("aria-label")).toBe("Show Isha's pass");
    expect(onIndex).toHaveBeenLastCalledWith(1);
    onIndex.mockClear();
    fireEvent.click(screen.getByTestId("pass-next"));
    expect(onIndex).toHaveBeenLastCalledWith(1);
    expect((screen.getByTestId("pass-prev") as HTMLButtonElement).disabled).toBe(true);
    // One pass at a time (28 Nov 2026): each is the track's full width, so the next one does not peek.
    for (const pass of screen.getAllByTestId("flight-pass")) expect(pass.style.flex).toBe("0 0 100%");
  });
});
