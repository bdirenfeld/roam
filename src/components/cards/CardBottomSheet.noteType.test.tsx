// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The word "Note" is a dropdown (10 Nov 2026, prototype approved): a note's
 * badge opens Activity / Food / Hotel / Drive / Train / Flight, and a kind
 * asks for a place with the Google search. The note is the live Tuscany one,
 * "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)".
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (_t: string, _m: unknown, patch: Record<string, unknown>) => { writes.calls.push(patch); return { error: null }; }),
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

const days = [{ id: "d10", trip_id: "t1", date: "2027-08-27", day_number: 4 }] as unknown as Day[];
const note = {
  id: "912956af", trip_id: "t1", day_id: "d10", place_id: null, place: null, status: "in_itinerary",
  start_time: "09:40:00", end_time: null, confirmed: false, position: 1, source_url: null,
  details: { title: "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)" },
} as unknown as Card;

async function open(readOnly = false) {
  await act(async () => { render(<CardBottomSheet card={note} onClose={() => {}} days={days} readOnly={readOnly} tripDestination="Tuscany, Italy" />); });
}

describe("CardBottomSheet — Note is a dropdown (10 Nov 2026)", () => {
  it("tapping Note lists the seven kinds", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    const picker = screen.getByTestId("note-type-picker");
    const rows = within(picker).getAllByRole("menuitem").map((b) => {
      const glyph = b.querySelector(".material-symbols-outlined")?.textContent ?? "";
      return (b.textContent ?? "").replace(glyph, "").replace("current", "").trim();
    });
    expect(rows).toEqual(["Note", "Activity", "Food", "Hotel", "Drive", "Train", "Flight"]);
  });

  it("picking Food saves it at once: the badge says Food and an optional Where? row appears (type now, place later)", async () => {
    writes.calls = [];
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    await act(async () => { fireEvent.click(within(screen.getByTestId("note-type-picker")).getByRole("menuitem", { name: /Food/ })); });
    expect(screen.queryByTestId("note-type-picker")).toBeNull();
    expect(writes.calls.at(-1)).toEqual({ details: { title: "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)", kind: "food" } });
    expect(screen.getByTestId("note-type-button").textContent).toContain("Food");
    const where = screen.getByTestId("note-where");
    expect(where.textContent).toContain("Where? Add a place");
    expect(where.textContent).toContain("optional");
    await act(async () => { fireEvent.click(within(where).getByRole("button")); });
    expect(screen.getByTestId("note-where").querySelector("input")).not.toBeNull();
  });

  it("Drive asks 'Where to?'", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    await act(async () => { fireEvent.click(within(screen.getByTestId("note-type-picker")).getByRole("menuitem", { name: /Drive/ })); });
    expect(screen.getByTestId("note-where").textContent).toContain("Where to? Add a place");
  });

  it("a guest gets no dropdown", async () => {
    await open(true);
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    expect(screen.queryByTestId("note-type-picker")).toBeNull();
  });
});
