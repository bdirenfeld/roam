// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import journeys from "@/lib/booking/fixtures/journeys.json";

/**
 * To book, at the top of Bookings (6 Oct 2026): three rows, each ticked from
 * the days or open with a Kayak link; the box opens Booked / Not needed;
 * owner only. Driven with real journeys from the live database.
 */

type J = { id: string; title: string; trip: Record<string, unknown>; home: { airport: string | null; country: string | null }; days: unknown[]; cards: unknown[]; birthdates: unknown[] };
const J_ = (title: string) => (journeys as unknown as J[]).find((j) => j.title === title)!;

let journey: J;
let signedIn: string | null;
const OWNER = "owner-1";

function query(table: string) {
  const single = () => {
    if (table === "trips") return { ...journey.trip, id: journey.id, user_id: OWNER };
    if (table === "users") return { home_airport: journey.home.airport, home_country: journey.home.country };
    return null;
  };
  const list = () => (table === "days" ? journey.days : table === "cards" ? journey.cards : table === "people" ? journey.birthdates.map((b) => ({ birthdate: b })) : []);
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q; q.not = () => q;
  q.maybeSingle = () => Promise.resolve({ data: single() });
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: list() }).then(res, rej);
  return q;
}
const client = { from: query, auth: { getSession: () => Promise.resolve({ data: { session: signedIn ? { user: { id: signedIn } } : null } }) } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
const queuedUpdate = vi.fn((...args: unknown[]) => args && Promise.resolve({ queued: false, error: null as null | { message: string } }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: (...a: unknown[]) => queuedUpdate(...a) }));

import ToBookSection from "./ToBookSection";

const fetchMock = vi.fn((...args: unknown[]) => args && Promise.resolve({ ok: true, json: () => Promise.resolve({ airports: ["PSA", "FLR"] }) }));
beforeEach(() => { signedIn = OWNER; vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("To book", () => {
  it("Tuscany: Flights and Car open with Kayak links; Stays ticked by the villa", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-a" />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").querySelector("a")?.getAttribute("href")).toContain("YYZ-PSA,FLR"));
    expect(screen.getByText("To book")).toBeTruthy();
    const flights = screen.getByTestId("to-book-flights");
    expect(flights.dataset.state).toBe("open");
    expect(flights.textContent).toContain("YYZ → PSA, FLR · 23 Aug – 4 Sep · 7 travellers");
    const link = flights.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://www.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(flights.textContent).toContain("↗");

    const stays = screen.getByTestId("to-book-stays");
    expect(stays.dataset.state).toBe("booked");
    expect(stays.textContent).toContain("Booked");
    expect(stays.querySelector("a")).toBeNull();
    expect(stays.textContent).not.toContain("↗");

    expect(screen.getByTestId("to-book-car").querySelector("a")!.getAttribute("href")).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h");
    // Airports asked once, for this journey.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/booking/airports");
  });

  it("the box opens Booked / Not needed; Not needed saves, ticks the row, and offers Undo", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-b" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: /Car: to book/ }));
    const menu = within(car).getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Not needed" }));

    expect(queuedUpdate).toHaveBeenCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "skip" } });
    await waitFor(() => expect(screen.getByTestId("to-book-car").dataset.state).toBe("skip"));
    expect(screen.getByTestId("to-book-car").textContent).toContain("Not needed");
    expect(screen.getByTestId("to-book-car").querySelector("a")).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Car: not needed", undo: expect.any(Function) }));

    // A choice is set, so the menu now offers Clear.
    await userEvent.click(within(screen.getByTestId("to-book-car")).getByRole("button", { name: /Car: not needed/ }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed", "Clear"]);

    // Undo writes the old checklist back.
    const undo = (toast.mock.calls[0][0] as { undo: () => Promise<void> }).undo;
    await undo();
    expect(queuedUpdate).toHaveBeenLastCalledWith("trips", { id: journey.id }, { booking_checklist: {} });
    await waitFor(() => expect(screen.getByTestId("to-book-car").dataset.state).toBe("open"));
  });

  it("a refused write puts the row back and says so", async () => {
    journey = J_("Tuscany");
    queuedUpdate.mockResolvedValueOnce({ queued: false, error: { message: "no" } });
    render(<ToBookSection tripId="tuscany-c" />);
    const flights = await screen.findByTestId("to-book-flights");
    await userEvent.click(within(flights).getByRole("button", { name: /Flights: to book/ }));
    await userEvent.click(within(flights).getByRole("menuitem", { name: "Booked" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: "Couldn't save that. Try again." }));
    expect(screen.getByTestId("to-book-flights").dataset.state).toBe("open");
  });

  it("New York (Mia & Daddy): flights and hotel on the days tick themselves, and no airport call is made", async () => {
    journey = J_("New York (Mia & Daddy)");
    render(<ToBookSection tripId="nyc" />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").dataset.state).toBe("booked"));
    expect(screen.getByTestId("to-book-flights").textContent).toContain("Booked · 23 Jul and 26 Jul");
    expect(screen.getByTestId("to-book-stays").dataset.state).toBe("booked");
    expect(screen.getByTestId("to-book-car").querySelector("a")!.getAttribute("href")).toBe("https://www.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a guest sees nothing, and nothing is asked", async () => {
    journey = J_("Tuscany");
    signedIn = "guest-9";
    const { container } = render(<ToBookSection tripId="tuscany-d" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("To book")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signed out (no session) sees nothing", async () => {
    journey = J_("Tuscany");
    signedIn = null;
    const { container } = render(<ToBookSection tripId="tuscany-e" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe("");
  });
});
