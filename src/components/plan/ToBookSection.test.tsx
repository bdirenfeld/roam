// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import journeys from "@/lib/booking/fixtures/journeys.json";

/**
 * To book, at the top of Bookings (6 Oct 2026): three rows, each ticked from
 * the days or open with a Kayak link; an open row's checkbox puts it in
 * "Search …"; the ⋯ opens Booked / Not needed; Stays opens Roam's Where to
 * stay; owner only. Driven with real journeys from the live database.
 */

type J = { id: string; title: string; trip: Record<string, unknown>; home: { airport: string | null; country: string | null }; days: unknown[]; cards: unknown[]; birthdates: unknown[] };
const J_ = (title: string) => (journeys as unknown as J[]).find((j) => j.title === title)!;
/** Tuscany with the villa taken away: Flights, Stays and Car all open. */
const tuscanyOpen = (): J => {
  const t = J_("Tuscany");
  return { ...t, cards: t.cards.filter((c) => (c as { place?: { title?: string } }).place?.title !== "Villa Zambaldi") };
};

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
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const queuedUpdate = vi.fn((...args: unknown[]) => args && Promise.resolve({ queued: false, error: null as null | { message: string } }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: (...a: unknown[]) => queuedUpdate(...a) }));

import ToBookSection from "./ToBookSection";

const fetchMock = vi.fn((...args: unknown[]) => args && Promise.resolve({ ok: true, json: () => Promise.resolve({ airports: ["PSA", "FLR"] }) }));
beforeEach(() => { signedIn = OWNER; vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const flightsReady = () => waitFor(() => expect(screen.getByTestId("to-book-flights").querySelector("a")?.getAttribute("href")).toContain("YYZ-PSA,FLR"));

describe("To book", () => {
  it("Tuscany: Flights and Car open with Kayak links; Stays ticked by the villa", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-a" />);
    await flightsReady();
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
    // A booked row is a ✓, not a checkbox; an open row's box is ticked.
    expect(within(stays).queryByRole("checkbox")).toBeNull();
    expect(within(flights).getByRole("checkbox", { name: "Include Flights in the search" }).getAttribute("aria-checked")).toBe("true");

    expect(screen.getByTestId("to-book-car").querySelector("a")!.getAttribute("href")).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(screen.getByRole("button", { name: "Search flights & car" })).toBeTruthy();
    // Airports asked once, for this journey.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/booking/airports");
  });

  it("the ⋯ opens Booked / Not needed; Not needed saves, marks the row, and offers Undo", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-b" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: "Car options" }));
    const menu = within(car).getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Not needed" }));

    expect(queuedUpdate).toHaveBeenCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "skip" } });
    await waitFor(() => expect(screen.getByTestId("to-book-car").dataset.state).toBe("skip"));
    expect(screen.getByTestId("to-book-car").textContent).toContain("Not needed");
    expect(screen.getByTestId("to-book-car").querySelector("a")).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Car: not needed", undo: expect.any(Function) }));

    // A choice is set, so the menu now offers Clear.
    await userEvent.click(within(screen.getByTestId("to-book-car")).getByRole("button", { name: "Car options" }));
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
    await userEvent.click(within(flights).getByRole("button", { name: "Flights options" }));
    await userEvent.click(within(flights).getByRole("menuitem", { name: "Booked" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: "Couldn't save that. Try again." }));
    expect(screen.getByTestId("to-book-flights").dataset.state).toBe("open");
    expect(screen.queryByTestId("to-book-cost")).toBeNull();
  });

  it("New York (Mia & Daddy): flights and hotel on the days tick themselves, and no airport call is made", async () => {
    journey = J_("New York (Mia & Daddy)");
    render(<ToBookSection tripId="nyc" />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").dataset.state).toBe("booked"));
    expect(screen.getByTestId("to-book-flights").textContent).toContain("Booked · 23 Jul and 26 Jul");
    expect(screen.getByTestId("to-book-stays").dataset.state).toBe("booked");
    expect(screen.getByTestId("to-book-car").querySelector("a")!.getAttribute("href")).toBe("https://www.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
    // One open row: the button names just it.
    expect(screen.getByRole("button", { name: "Search car" })).toBeTruthy();
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

describe("Search, and Stays opening Where to stay", () => {
  it("every Kayak tab in one click, then Where to stay (phone: the Map screen)", async () => {
    journey = tuscanyOpen();
    const opened: string[] = [];
    const open = vi.fn((url: string) => { opened.push(url); return {} as Window; });
    vi.stubGlobal("open", open);
    const leave = vi.fn();
    render(<ToBookSection tripId="tuscany-f" onLeave={leave} />);
    await flightsReady();
    await userEvent.click(screen.getByRole("button", { name: "Search flights, car & stays" }));
    expect(opened).toEqual([
      "https://www.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a",
      "https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X",
    ]);
    expect((open.mock.calls[0] as unknown[])[1]).toBe("_blank");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/trips/tuscany-f/map?stays=1");
  });

  it("a computer goes to the Plan's Where to stay, as the journey menu did", async () => {
    journey = tuscanyOpen();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(min-width: 768px)" }));
    render(<ToBookSection tripId="tuscany-g" />);
    await userEvent.click(within(await screen.findByTestId("to-book-stays")).getByRole("button", { name: /Opens Where to stay/ }));
    expect(push).toHaveBeenCalledWith("/trips/tuscany-g/plan?stays=1");
  });

  it("tapping the Stays row opens Where to stay alone; no Kayak tab", async () => {
    journey = tuscanyOpen();
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("open", open);
    render(<ToBookSection tripId="tuscany-h" />);
    const stays = await screen.findByTestId("to-book-stays");
    expect(stays.querySelector("a")).toBeNull();
    await userEvent.click(within(stays).getByRole("button", { name: /Opens Where to stay/ }));
    expect(open).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/trips/tuscany-h/map?stays=1");
  });

  it("stays booked (Tuscany's villa): Where to stay is still one tap away, in the row's ⋯", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-m" />);
    const stays = await screen.findByTestId("to-book-stays");
    await userEvent.click(within(stays).getByRole("button", { name: "Stays options" }));
    expect(within(stays).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed", "Where to stay"]);
    await userEvent.click(within(stays).getByRole("menuitem", { name: "Where to stay" }));
    expect(push).toHaveBeenCalledWith("/trips/tuscany-m/map?stays=1");
  });

  it("an unticked row stays out of the search", async () => {
    journey = tuscanyOpen();
    const opened: string[] = [];
    vi.stubGlobal("open", vi.fn((url: string) => { opened.push(url); return {} as Window; }));
    render(<ToBookSection tripId="tuscany-i" />);
    await flightsReady();
    const carBox = within(screen.getByTestId("to-book-car")).getByRole("checkbox");
    await userEvent.click(carBox);
    expect(carBox.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(within(screen.getByTestId("to-book-stays")).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Search flights" }));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("/flights/");
    expect(push).not.toHaveBeenCalled();
  });

  it("an iPhone that blocks the second tab: the rest wait as a Next button, one tap each", async () => {
    journey = tuscanyOpen();
    let n = 0;
    vi.stubGlobal("open", vi.fn(() => (n++ === 0 ? ({} as Window) : null)));
    render(<ToBookSection tripId="tuscany-j" />);
    await flightsReady();
    await userEvent.click(screen.getByRole("button", { name: "Search flights, car & stays" }));
    expect(push).not.toHaveBeenCalled();
    const next = screen.getByRole("button", { name: "Next: Car ↗" });
    vi.stubGlobal("open", vi.fn(() => ({}) as Window));
    await userEvent.click(next);
    expect(push).toHaveBeenCalledWith("/trips/tuscany-j/map?stays=1");
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
  });
});

describe("What did it cost?", () => {
  it("Booked by hand asks; the amount is saved in the budget's currency and shows on the row", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-k" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: "Car options" }));
    await userEvent.click(within(car).getByRole("menuitem", { name: "Booked" }));
    expect(queuedUpdate).toHaveBeenLastCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "booked" } });
    const form = await screen.findByTestId("to-book-cost");
    // No budget row: the destination's currency (Italy → EUR).
    expect((within(form).getByLabelText("Currency") as HTMLSelectElement).value).toBe("EUR");
    await userEvent.type(within(form).getByLabelText("What did it cost?"), "1450");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(queuedUpdate).toHaveBeenLastCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "booked", costs: { car: { amount: 1450, currency: "EUR" } } } });
    await waitFor(() => expect(screen.getByTestId("to-book-car").textContent).toContain("Booked · €1,450"));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Car: €1,450", undo: expect.any(Function) }));
    expect(within(screen.getByTestId("to-book-car")).queryByRole("checkbox")).toBeNull();
  });

  it("Not now leaves it Booked with no cost", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-l" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: "Car options" }));
    await userEvent.click(within(car).getByRole("menuitem", { name: "Booked" }));
    await userEvent.click(within(await screen.findByTestId("to-book-cost")).getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("to-book-cost")).toBeNull();
    expect(queuedUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("to-book-car").textContent).toContain("Booked");
  });
});
