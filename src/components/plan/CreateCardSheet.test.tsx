// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import type { Card } from "@/types/database";

/**
 * The Add-a-place sheet after the taps audit (6 Oct 2026):
 * - a Google result, once added, says so in the one toast — "Added <place> to
 *   Tue 25 Aug · Undo" — instead of snapping back to an empty sheet;
 * - a failed place save says so instead of returning silently;
 * - a previewed saved row hands the host its own Add, so the card's button
 *   can add it and the row reads "Added ✓" on return.
 */

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast, dismiss: vi.fn() }) }));
const del = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedInsert: vi.fn(async () => ({ error: null })), queuedDelete: del }));
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));
const schedule = vi.hoisted(() => vi.fn(async () => ({ id: "day-card-1" })));
vi.mock("@/lib/scheduleCard", () => ({ scheduleCardOnDay: schedule }));

// A saved Florence lunch, as the cards+place select returns it.
const vinaio = {
  id: "s1", trip_id: "t1", day_id: null, status: "interested", place_id: "p1", position: 0, details: {}, source_url: null,
  place: { id: "p1", title: "All'Antico Vinaio", type: "food", sub_type: "restaurant", lat: 43.77, lng: 11.26, address: "Via dei Neri, 74r, 50122 Firenze FI, Italy", google_place_id: "gV", cover_image_url: null, rating: 4.5, price_level: 1 },
} as unknown as Card;

const db = vi.hoisted(() => ({ placeError: null as unknown, inserted: [] as unknown[] }));
vi.mock("@/lib/supabase/client", () => {
  const client = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const k of ["select", "eq", "not", "upsert"]) chain[k] = self;
      chain.single = async () => (db.placeError ? { data: null, error: db.placeError } : { data: { id: "pl-new" }, error: null });
      chain.insert = async (row: unknown) => { db.inserted.push(row); return { error: null }; };
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "cards" ? [vinaio] : [], error: null }).then(ok);
      return chain;
    },
  };
  return { createClient: () => client };
});

import CreateCardSheet from "./CreateCardSheet";

function stubGoogle() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.startsWith("/api/places/autocomplete")
      ? { predictions: [{ place_id: "gM", description: "Trattoria Mario", structured_formatting: { main_text: "Trattoria Mario", secondary_text: "Via Rosina, Florence, Italy" } }] }
      : url.startsWith("/api/places/details")
      ? { result: { name: "Trattoria Mario", formatted_address: "Via Rosina, 2r, 50123 Firenze FI, Italy", geometry: { location: { lat: 43.776, lng: 11.253 } }, types: ["tourist_attraction"] } }
      : {},
  })));
}

const props = {
  dayId: "d3", tripId: "t1", endPosition: 4, onClose: () => {}, dayLabel: "Tue 25 Aug",
};

beforeEach(() => { db.placeError = null; db.inserted = []; toast.mockClear(); del.mockClear(); schedule.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function addGoogleResult(onCardCreated = vi.fn(), onCardRemoved = vi.fn()) {
  stubGoogle();
  await act(async () => { render(<CreateCardSheet {...props} onCardCreated={onCardCreated} onCardRemoved={onCardRemoved} />); });
  fireEvent.change(await screen.findByPlaceholderText("Search saved places, or anywhere"), { target: { value: "trattoria mario" } });
  fireEvent.click((await screen.findByText("Trattoria Mario", {}, { timeout: 2000 })).closest("button")!);
  return { onCardCreated, onCardRemoved };
}

describe("CreateCardSheet — a Google add says where it went (6 Oct 2026, taps audit)", () => {
  it("toasts 'Added Trattoria Mario to Tue 25 Aug' with an Undo that takes the card off", async () => {
    const { onCardCreated, onCardRemoved } = await addGoogleResult();
    await waitFor(() => expect(onCardCreated).toHaveBeenCalled());
    const newId = (onCardCreated.mock.calls[0][0] as Card).id;
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Added Trattoria Mario to Tue 25 Aug" })));
    const { undo } = toast.mock.calls.find((c) => c[0].message.startsWith("Added"))![0];
    expect(typeof undo).toBe("function");
    await act(async () => { await undo(); });
    expect(del).toHaveBeenCalledWith("cards", { id: newId });
    expect(onCardRemoved).toHaveBeenCalledWith(newId);
  });

  it("a failed place save says so instead of going quiet", async () => {
    db.placeError = { message: "denied" };
    const { onCardCreated } = await addGoogleResult();
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: "Couldn't save that place. Try again." }));
    expect(onCardCreated).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });
});

describe("CreateCardSheet — previewing a saved row hands over its Add (6 Oct 2026, taps audit)", () => {
  it("the add it hands the host puts the place on the day and the row reads Added ✓", async () => {
    const onPreviewCard = vi.fn();
    const onCardCreated = vi.fn();
    await act(async () => { render(<CreateCardSheet {...props} onCardCreated={onCardCreated} onPreviewCard={onPreviewCard} />); });
    fireEvent.click(await screen.findByText("All'Antico Vinaio"));
    expect(onPreviewCard).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), expect.any(Function));
    expect(schedule).not.toHaveBeenCalled();
    const add = onPreviewCard.mock.calls[0][1] as () => Promise<boolean>;
    let ok = false;
    await act(async () => { ok = await add(); });
    expect(ok).toBe(true);
    expect(schedule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dayId: "d3", placeId: "p1" }));
    expect(onCardCreated).toHaveBeenCalledWith({ id: "day-card-1" });
    expect(screen.getByText("Added ✓")).toBeTruthy();
  });
});
