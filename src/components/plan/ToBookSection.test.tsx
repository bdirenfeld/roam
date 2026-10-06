// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import journeys from "@/lib/booking/fixtures/journeys.json";
import type { BookingFile } from "@/lib/booking/files";

/**
 * Bookings, the owner's view (6 Oct 2026 redesign, mock approved): three rows,
 * ONE mark each (○ to book, green ✓ booked, dashed – not needed), one short
 * line, the whole row is the tap; the mark opens Booked / Not needed / Clear;
 * one "Book N on Kayak" button; a quiet "Upload a confirmation" link; uploads
 * inside their row; "Other files (n)" only when there are any. Owner only.
 * Driven with real journeys from the live database.
 */

type J = { id: string; title: string; trip: Record<string, unknown>; home: { airport: string | null; country: string | null }; days: unknown[]; cards: unknown[]; birthdates: unknown[] };
const J_ = (title: string) => (journeys as unknown as J[]).find((j) => j.title === title)!;
/** Tuscany with the villa taken away: Flights, Stays and Car all open. */
const tuscanyOpen = (): J => {
  const t = J_("Tuscany");
  return { ...t, cards: t.cards.filter((c) => (c as { place?: { title?: string } }).place?.title !== "Villa Zambaldi") };
};
const NY_OUT_DAY = "3566d88c-51ad-4211-aa2e-3b9af0117087"; // New York (Mia & Daddy), 23 Jul

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

const rowOf = (key: string) => screen.getByTestId(`to-book-${key}-row`);
const flightsReady = () => waitFor(() => expect(rowOf("flights").getAttribute("href")).toContain("YYZ-PSA,FLR"));
const file = (over: Partial<BookingFile>): BookingFile => ({
  id: "f1", source: "attachment", fileName: "AC890.pdf", url: "https://signed/AC890.pdf", type: "application/pdf",
  row: "flights", label: "Air Canada", detail: "on LaGuardia Airport", createdAt: "2026-07-01T00:00:00Z", ...over,
});

describe("Bookings: three rows, one mark each", () => {
  it("Tuscany, as the mock: Flights and Car to book, Stays booked by the villa, one button", async () => {
    journey = J_("Tuscany");
    const onOwner = vi.fn();
    render(<ToBookSection tripId="tuscany-a" onImport={() => {}} onOwner={onOwner} />);
    await flightsReady();
    expect(onOwner).toHaveBeenCalledWith(true);

    const flights = screen.getByTestId("to-book-flights");
    expect(flights.dataset.state).toBe("open");
    expect(rowOf("flights").textContent).toBe("FlightsToronto → Pisa · 7 people›");
    // The row IS the tap: a real link to the filled-in Kayak search.
    expect(rowOf("flights").getAttribute("href")).toBe("https://www.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
    expect(rowOf("flights").getAttribute("target")).toBe("_blank");

    expect(screen.getByTestId("to-book-stays").dataset.state).toBe("booked");
    expect(rowOf("stays").textContent).toBe("StaysVilla Zambaldi · all 11 nights›");
    expect(rowOf("stays").tagName).toBe("BUTTON");

    expect(rowOf("car").textContent).toBe("CarPisa airport · 7 seats›");
    expect(rowOf("car").getAttribute("href")).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");

    // One mark per row, a 44px target; no checkbox, no ⋯, no ↗, no section labels.
    const mark = within(flights).getByRole("button", { name: "Flights: still to book. Change" });
    expect(mark.className).toContain("w-11 h-11");
    expect(within(screen.getByTestId("to-book-stays")).getByRole("button", { name: "Stays: booked. Change" })).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /options/ })).toBeNull();
    const all = screen.getByTestId("to-book").textContent!;
    for (const gone of ["↗", "⋯", "To book", "Uploaded", "No documents yet"]) expect(all).not.toContain(gone);

    // ONE primary button, and the quiet upload link under it.
    expect(screen.getByRole("button", { name: "Book 2 on Kayak" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload a confirmation" })).toBeTruthy();
    // No Other files when there are none.
    expect(screen.queryByText(/Other files/)).toBeNull();
    // The count: three rows, the button, the link — and nothing else to tap.
    expect(within(screen.getByTestId("to-book")).getAllByRole("button").length + within(screen.getByTestId("to-book")).getAllByRole("link").length).toBe(3 + 3 + 1 + 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the mark opens Booked / Not needed; Not needed saves, dashes the row, and offers Undo", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-b" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: "Car: still to book. Change" }));
    const menu = within(car).getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Not needed" }));

    expect(queuedUpdate).toHaveBeenCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "skip" } });
    await waitFor(() => expect(screen.getByTestId("to-book-car").dataset.state).toBe("skip"));
    expect(rowOf("car").textContent).toContain("Not needed");
    expect(rowOf("car").tagName).toBe("BUTTON");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Car: not needed", undo: expect.any(Function) }));
    // Not needed is out of the button's count.
    expect(screen.getByRole("button", { name: "Book 1 on Kayak" })).toBeTruthy();

    // A choice is set, so the menu now offers Clear; a tap on the dashed row opens it too.
    await userEvent.click(rowOf("car"));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed", "Clear"]);

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
    await userEvent.click(within(flights).getByRole("button", { name: /^Flights: / }));
    await userEvent.click(within(flights).getByRole("menuitem", { name: "Booked" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: "Couldn't save that. Try again." }));
    expect(screen.getByTestId("to-book-flights").dataset.state).toBe("open");
    expect(screen.queryByTestId("to-book-cost")).toBeNull();
  });

  it("a guest sees nothing, is told apart, and nothing is asked", async () => {
    journey = J_("Tuscany");
    signedIn = "guest-9";
    const onOwner = vi.fn();
    const { container } = render(<ToBookSection tripId="tuscany-d" onOwner={onOwner} />);
    await waitFor(() => expect(onOwner).toHaveBeenCalledWith(false));
    expect(container.innerHTML).toBe("");
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

describe("uploads inside their row", () => {
  it("New York: the flights' confirmation names the booking and opens from the row", async () => {
    journey = J_("New York (Mia & Daddy)");
    const onOpenFile = vi.fn();
    const f = file({});
    render(<ToBookSection tripId="nyc-a" files={[f]} onOpenFile={onOpenFile} />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").dataset.state).toBe("booked"));
    expect(rowOf("flights").textContent).toBe("FlightsAir Canada · confirmation›");
    await userEvent.click(rowOf("flights"));
    expect(onOpenFile).toHaveBeenCalledWith(f);
    expect(push).not.toHaveBeenCalled();
    // One row still to book (the car): the button counts it. No airport call.
    expect(screen.getByRole("button", { name: "Book 1 on Kayak" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("booked with no file: the row opens the day its flight is on", async () => {
    journey = J_("New York (Mia & Daddy)");
    const leave = vi.fn();
    render(<ToBookSection tripId="nyc-b" onLeave={leave} />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").dataset.state).toBe("booked"));
    expect(rowOf("flights").textContent).toBe("Flights23 Jul and 26 Jul›");
    await userEvent.click(rowOf("flights"));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/trips/nyc-b/days/${NY_OUT_DAY}`);
  });

  it("two files on a row unfold under it, each opening on its own", async () => {
    journey = J_("New York (Mia & Daddy)");
    const onOpenFile = vi.fn();
    const back = file({ id: "f2", fileName: "AC891.pdf" });
    render(<ToBookSection tripId="nyc-c" files={[file({}), back]} onOpenFile={onOpenFile} />);
    await waitFor(() => expect(screen.getByTestId("to-book-flights").dataset.state).toBe("booked"));
    expect(screen.queryByTestId("to-book-flights-files")).toBeNull();
    await userEvent.click(rowOf("flights"));
    const list = screen.getByTestId("to-book-flights-files");
    await userEvent.click(within(list).getByRole("button", { name: "AC891.pdf" }));
    expect(onOpenFile).toHaveBeenCalledWith(back);
  });

  it("an upload record in a row can be removed from the mark's menu", async () => {
    journey = J_("New York (Mia & Daddy)");
    const remove = vi.fn();
    render(<ToBookSection tripId="nyc-d" files={[file({ id: "doc-1", source: "document", url: null })]} onRemoveDocument={remove} />);
    const flights = await screen.findByTestId("to-book-flights");
    await waitFor(() => expect(flights.dataset.state).toBe("booked"));
    expect(rowOf("flights").textContent).toBe("FlightsAir Canada · confirmation›");
    await userEvent.click(within(flights).getByRole("button", { name: "Flights: booked. Change" }));
    await userEvent.click(within(flights).getByRole("menuitem", { name: "Remove the upload" }));
    expect(remove).toHaveBeenCalledWith("doc-1");
  });

  it("files that match no row are a quiet Other files (n) link that unfolds", async () => {
    journey = J_("Tuscany");
    const onOpenFile = vi.fn();
    const ticket = file({ id: "t1", row: null, fileName: "Uffizi tickets.pdf", label: null, detail: "on Uffizi Gallery" });
    render(<ToBookSection tripId="tuscany-o" files={[ticket]} onOpenFile={onOpenFile} />);
    const other = await screen.findByRole("button", { name: "Other files (1)" });
    expect(screen.queryByTestId("to-book-other")).toBeNull();
    await userEvent.click(other);
    await userEvent.click(within(screen.getByTestId("to-book-other")).getByRole("button", { name: /Uffizi tickets\.pdf/ }));
    expect(onOpenFile).toHaveBeenCalledWith(ticket);
  });

  it("the upload link runs the host's upload", async () => {
    journey = J_("Tuscany");
    const onImport = vi.fn();
    render(<ToBookSection tripId="tuscany-u" onImport={onImport} />);
    await userEvent.click(await screen.findByRole("button", { name: "Upload a confirmation" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe("Book N on Kayak, and Stays opening Where to stay", () => {
  it("every Kayak tab in one click, then Where to stay (phone: the Map screen)", async () => {
    journey = tuscanyOpen();
    const opened: string[] = [];
    const open = vi.fn((url: string) => { opened.push(url); return {} as Window; });
    vi.stubGlobal("open", open);
    const leave = vi.fn();
    render(<ToBookSection tripId="tuscany-f" onLeave={leave} />);
    await flightsReady();
    await userEvent.click(screen.getByRole("button", { name: "Book 3 on Kayak" }));
    expect(opened).toEqual([
      "https://www.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a",
      "https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X",
    ]);
    expect((open.mock.calls[0] as unknown[])[1]).toBe("_blank");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/trips/tuscany-f/map?stays=1");
  });

  it("a computer goes to the Plan's Where to stay", async () => {
    journey = tuscanyOpen();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(min-width: 768px)" }));
    render(<ToBookSection tripId="tuscany-g" />);
    await screen.findByTestId("to-book-stays");
    expect(rowOf("stays").textContent).toBe("StaysLucca · 11 nights›");
    await userEvent.click(rowOf("stays"));
    expect(push).toHaveBeenCalledWith("/trips/tuscany-g/plan?stays=1");
  });

  it("Stays booked (the villa) and no file: the row still opens Where to stay", async () => {
    journey = J_("Tuscany");
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("open", open);
    render(<ToBookSection tripId="tuscany-h" />);
    await screen.findByTestId("to-book-stays");
    await userEvent.click(rowOf("stays"));
    expect(open).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/trips/tuscany-h/map?stays=1");
  });

  it("Stays booked WITH its hotel's file: the row opens the file, Where to stay moves to the mark's menu", async () => {
    journey = J_("Tuscany");
    const onOpenFile = vi.fn();
    const villa = file({ id: "v", row: "stays", fileName: "Villa Zambaldi.pdf", label: "Villa Zambaldi" });
    render(<ToBookSection tripId="tuscany-m" files={[villa]} onOpenFile={onOpenFile} />);
    const stays = await screen.findByTestId("to-book-stays");
    await userEvent.click(rowOf("stays"));
    expect(onOpenFile).toHaveBeenCalledWith(villa);
    await userEvent.click(within(stays).getByRole("button", { name: "Stays: booked. Change" }));
    expect(within(stays).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed", "Where to stay"]);
    await userEvent.click(within(stays).getByRole("menuitem", { name: "Where to stay" }));
    expect(push).toHaveBeenCalledWith("/trips/tuscany-m/map?stays=1");
  });

  it("nothing left to book: no button, the upload link stays", async () => {
    journey = J_("Tuscany");
    const t = J_("Tuscany");
    journey = { ...t, trip: { ...t.trip, booking_checklist: { flights: "booked", car: "skip" } } };
    render(<ToBookSection tripId="tuscany-n" onImport={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("to-book-car").dataset.state).toBe("skip"));
    expect(screen.queryByRole("button", { name: /on Kayak/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Upload a confirmation" })).toBeTruthy();
    expect(rowOf("flights").textContent).toBe("FlightsMarked booked›");
  });

  it("an iPhone that blocks the second tab: the rest wait as a Next button, one tap each", async () => {
    journey = tuscanyOpen();
    let n = 0;
    vi.stubGlobal("open", vi.fn(() => (n++ === 0 ? ({} as Window) : null)));
    render(<ToBookSection tripId="tuscany-j" />);
    await flightsReady();
    await userEvent.click(screen.getByRole("button", { name: "Book 3 on Kayak" }));
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
    await userEvent.click(within(car).getByRole("button", { name: /^Car: / }));
    await userEvent.click(within(car).getByRole("menuitem", { name: "Booked" }));
    expect(queuedUpdate).toHaveBeenLastCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "booked" } });
    const form = await screen.findByTestId("to-book-cost");
    // No budget row: the destination's currency (Italy → EUR).
    expect((within(form).getByLabelText("Currency") as HTMLSelectElement).value).toBe("EUR");
    await userEvent.type(within(form).getByLabelText("What did it cost?"), "1450");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(queuedUpdate).toHaveBeenLastCalledWith("trips", { id: journey.id }, { booking_checklist: { car: "booked", costs: { car: { amount: 1450, currency: "EUR" } } } });
    await waitFor(() => expect(rowOf("car").textContent).toBe("CarPaid €1,450›"));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Car: €1,450", undo: expect.any(Function) }));
    // The mark is now the green ✓, and the menu offers the cost again.
    await userEvent.click(within(screen.getByTestId("to-book-car")).getByRole("button", { name: "Car: booked. Change" }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Booked", "Not needed", "What did it cost?", "Clear"]);
  });

  it("Not now leaves it Booked with no cost", async () => {
    journey = J_("Tuscany");
    render(<ToBookSection tripId="tuscany-l" />);
    const car = await screen.findByTestId("to-book-car");
    await userEvent.click(within(car).getByRole("button", { name: /^Car: / }));
    await userEvent.click(within(car).getByRole("menuitem", { name: "Booked" }));
    await userEvent.click(within(await screen.findByTestId("to-book-cost")).getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("to-book-cost")).toBeNull();
    expect(queuedUpdate).toHaveBeenCalledTimes(1);
    expect(rowOf("car").textContent).toBe("CarMarked booked›");
  });
});
