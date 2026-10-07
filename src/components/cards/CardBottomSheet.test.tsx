// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, Day } from "@/types/database";

/**
 * The card sheet after the designer audit (6 Oct 2026), rendered with his
 * Tuscany lunch — Buca di Sant'Antonio, Tue 24 Aug, 12:45–2:00 PM, with the
 * generated note exactly as stored.
 *
 * Gone from the surface: the "1h 15m" beside the times, the "NOTES" label, the
 * note's "Open … that day" point (the Hours row says it), and the Booked
 * switch. Booked's other door is the ⋯ menu, and it must still write
 * cards.confirmed the same way — that column feeds the row's Booked badge,
 * the Estimate and Re-plan.
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<{ table: string; patch: Record<string, unknown> }> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, _m: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, patch }); return { error: null }; }),
  queuedDelete: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert", "neq"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
    chain.storage = { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) };
    return chain;
  };
  return { createClient: () => make() };
});
vi.mock("./PlacePhotoGallery", () => ({ default: () => null }));

import CardBottomSheet from "./CardBottomSheet";

const NOTE = "**Intent**\nOne of Lucca's oldest trattorias, serving traditional Lucchese food that has barely changed in decades.\n\n**Know before you go**\n- Booking ahead is strongly advised, especially for a group of seven.\n- The menu leans heavily on offal and game; the roast meats and handmade pasta are safer bets for children.\n- Prices are mid-to-high for Lucca; service is formal by local standards.\n- Open 12:30 – 2:30 PM, 7:30 – 10:00 PM that day";
const WEEK = ["Monday: Closed", "Tuesday: 12:30 – 2:30 PM, 7:30 – 10:00 PM", "Wednesday: 12:30 – 2:30 PM, 7:30 – 10:00 PM", "Thursday: 12:30 – 2:30 PM, 7:30 – 10:00 PM", "Friday: 12:30 – 2:30 PM, 7:30 – 10:00 PM", "Saturday: 12:30 – 2:30 PM, 7:30 – 10:00 PM", "Sunday: Closed"];

const days = [
  { id: "d1", trip_id: "t1", date: "2027-08-24", day_number: 1 },
  { id: "d2", trip_id: "t1", date: "2027-08-25", day_number: 2 },
] as unknown as Day[];

function buca(over: Partial<Card> = {}, hours: unknown = { weekday_text: WEEK }): Card {
  return {
    id: "c1", trip_id: "t1", day_id: "d1", place_id: "p1", status: "in_itinerary",
    start_time: "12:45:00", end_time: "14:00:00", confirmed: false, position: 0,
    details: { notes: NOTE }, source_url: null,
    place: {
      id: "p1", title: "Buca di Sant'Antonio", type: "food", sub_type: "restaurant",
      address: "Via della Cervia, 3, 55100 Lucca LU, Italy", lat: 43.84, lng: 10.5,
      rating: 4.6, price_level: 3, hours, google_place_id: "g1", details: {},
    },
    ...over,
  } as unknown as Card;
}

async function open(card: Card, extra: Record<string, unknown> = {}) {
  const onCardUpdate = vi.fn();
  await act(async () => {
    render(<CardBottomSheet card={card} onClose={() => {}} onCardUpdate={onCardUpdate} onCardDelete={() => {}} days={days} {...extra} />);
  });
  return { onCardUpdate };
}

beforeEach(() => { writes.calls = []; });

describe("CardBottomSheet — the designer-audit surface (6 Oct 2026)", () => {
  it("shows the times without a duration, and the note without a NOTES label", async () => {
    await open(buca());
    expect(screen.getByLabelText("Change the time").textContent).toMatch(/12:45 PM – 2:00 PM/);
    expect(screen.queryByText("1h 15m")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.getByText(/One of Lucca's oldest trattorias/)).toBeTruthy();
  });

  it("drops the note's 'Open … that day' point when the Hours row is there, and keeps it when not", async () => {
    const { unmount } = render(<CardBottomSheet card={buca()} onClose={() => {}} days={days} />);
    await act(async () => {});
    expect(screen.getByLabelText("Opening hours")).toBeTruthy();
    expect(screen.queryByText(/that day/)).toBeNull();
    expect(screen.getByText(/Booking ahead is strongly advised/)).toBeTruthy();
    unmount();
    // No hours on the place → no Hours row → the note's line is the only place it is said.
    render(<CardBottomSheet card={buca({}, null)} onClose={() => {}} days={days} />);
    await act(async () => {});
    expect(screen.queryByLabelText("Opening hours")).toBeNull();
    expect(screen.getByText(/Open 12:30 – 2:30 PM, 7:30 – 10:00 PM that day/)).toBeTruthy();
  });

  it("hours sit right under the time as one line, and a tap opens the week (7 Oct 2026, taps audit)", async () => {
    await open(buca());
    const row = screen.getByLabelText("Opening hours");
    // Tue 24 Aug 2027 is not today, so the line names the day rather than saying "today".
    expect(row.textContent).toBe("Open 12:30 – 2:30 PM, 7:30 – 10:00 PM on Tuesday");
    const time = screen.getByLabelText("Change the time");
    const note = screen.getByText(/Booking ahead is strongly advised/);
    expect(time.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.getAttribute("aria-expanded")).toBe("false");
    const week = screen.getByText("Monday").closest("ul")!;
    expect(week.hidden).toBe(true);
    await userEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(week.hidden).toBe(false);
    expect(within(week).getAllByText("Closed")).toHaveLength(2);
  });

  it("a closed day is phrased the same way", async () => {
    await open(buca({ day_id: "d0" } as Partial<Card>), { days: [...days, { id: "d0", trip_id: "t1", date: "2027-08-23", day_number: 0 }] });
    expect(screen.getByLabelText("Opening hours").textContent).toBe("Closed on Monday");
  });

  it("has no Booked switch on the surface; Booked is in the ⋯ and writes cards.confirmed", async () => {
    const { onCardUpdate } = await open(buca());
    expect(screen.queryByText("Booked")).toBeNull();
    await userEvent.click(screen.getByLabelText("More options"));
    const menu = screen.getByRole("menu");
    const booked = within(menu).getByRole("menuitemcheckbox", { name: "Booked" });
    expect(booked.getAttribute("aria-checked")).toBe("false");
    // Move / Repeat / Take off still there beside it.
    expect(within(menu).getByText("Move to day")).toBeTruthy();
    expect(within(menu).getByText("Take off this day")).toBeTruthy();
    await userEvent.click(booked);
    expect(writes.calls).toContainEqual({ table: "cards", patch: { confirmed: true } });
    expect(onCardUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", confirmed: true }));
    // The menu stays open and the switch shows the new state.
    expect(within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: "Booked" }).getAttribute("aria-checked")).toBe("true");
  });

  it("Take off this day reports itself to the host as a take-off, not a delete, so the toast can say so (6 Oct 2026, taps audit)", async () => {
    const onCardDelete = vi.fn();
    await open(buca(), { onCardDelete });
    await userEvent.click(screen.getByLabelText("More options"));
    await userEvent.click(within(screen.getByRole("menu")).getByText("Take off this day"));
    // No saved copy came back from this stub, so savedId is null; the flag is what matters.
    await waitFor(() => expect(onCardDelete).toHaveBeenCalledWith("c1", { savedId: null }));
  });

  it("a saved (not scheduled) restaurant still reaches Booked — the ⋯ shows for it alone", async () => {
    await open(buca({ status: "interested", day_id: null, start_time: null, end_time: null } as unknown as Partial<Card>));
    await userEvent.click(screen.getByLabelText("More options"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemcheckbox").map((b) => b.textContent)).toEqual(["Booked"]);
    expect(within(menu).queryByText("Move to day")).toBeNull();
  });

  it("a guest sees no ⋯ and no Booked", async () => {
    await open(buca(), { readOnly: true });
    expect(screen.queryByLabelText("More options")).toBeNull();
    expect(screen.queryByText("Booked")).toBeNull();
  });
});

describe("CardBottomSheet — directions remember the app (6 Oct 2026, taps audit)", () => {
  const ADDR = "Directions to Via della Cervia, 3, 55100 Lucca LU, Italy";
  beforeEach(() => { window.localStorage.clear(); window.open = vi.fn() as unknown as typeof window.open; });

  it("first time: the chooser, Google opens the route, and Remember (on by default) skips the chooser next time", async () => {
    await open(buca());
    await userEvent.click(screen.getByLabelText(ADDR));
    expect(screen.getByText("Get directions to")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Remember my choice" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByText("Google Maps"));
    expect(window.open).toHaveBeenCalledWith("https://www.google.com/maps/dir/?api=1&destination=43.84,10.5&destination_place_id=g1", "_blank");
    expect(window.localStorage.getItem("roam:directions-app")).toBe("google");
    // Remembered: the address goes straight to Google, and offers the other app once.
    (window.open as unknown as ReturnType<typeof vi.fn>).mockClear();
    await userEvent.click(screen.getByLabelText(ADDR));
    expect(screen.queryByText("Get directions to")).toBeNull();
    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/dir\//), "_blank");
    await userEvent.click(screen.getByRole("button", { name: "Use Waze instead" }));
    expect(window.open).toHaveBeenLastCalledWith("https://waze.com/ul?ll=43.84,10.5&navigate=yes", "_blank");
    expect(window.localStorage.getItem("roam:directions-app")).toBe("waze");
    expect(screen.getByRole("button", { name: "Use Google Maps instead" })).toBeTruthy();
  });

  it("with Remember turned off, the chooser keeps asking", async () => {
    await open(buca());
    await userEvent.click(screen.getByLabelText(ADDR));
    await userEvent.click(screen.getByRole("switch", { name: "Remember my choice" }));
    await userEvent.click(screen.getByText("Waze"));
    expect(window.localStorage.getItem("roam:directions-app")).toBeNull();
    await userEvent.click(screen.getByLabelText(ADDR));
    expect(screen.getByText("Get directions to")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /instead$/ })).toBeNull();
  });
});

describe("CardBottomSheet — previewed from the add sheet (6 Oct 2026, taps audit)", () => {
  const saved = () => buca({ status: "interested", day_id: null as unknown as string, start_time: null, end_time: null });

  it("the button names the day, runs the row's Add, and closes back to the sheet", async () => {
    const onAdd = vi.fn(async () => true);
    const onClose = vi.fn();
    await act(async () => {
      render(<CardBottomSheet card={saved()} onClose={onClose} days={days} addToDay={{ label: "Tue 25 Aug", onAdd }} />);
    });
    expect(screen.queryByText("Put on a day")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add to Tue 25 Aug" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText("Put on a day")).toBeNull(); // no second day list
  });

  it("a failed add keeps the card open", async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<CardBottomSheet card={saved()} onClose={onClose} days={days} addToDay={{ label: "Tue 25 Aug", onAdd: async () => false }} />);
    });
    await userEvent.click(screen.getByRole("button", { name: "Add to Tue 25 Aug" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("anywhere else, Put on a day is unchanged", async () => {
    await open(saved());
    expect(screen.getByRole("button", { name: "Put on a day" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
  });
});
