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
  // Notes use the same type sheet as every card (19 Nov 2026, his ask: desktop notes had the old dropdown).
  it("tapping Note opens the type sheet: Just a note, then Food / Activity / Logistics", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("What kind of card?")).toBeTruthy();
    expect(screen.getByTestId("type-sheet-note").getAttribute("aria-pressed")).toBe("true");
    expect(within(sheet).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Food", "Activity", "Logistics"]);
  });

  it("picking Food › Restaurant saves it at once: the badge says Food, the exact kind is kept, and an optional Where? row appears", async () => {
    writes.calls = [];
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("tab", { name: "Food" })); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Restaurant/ })); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes.calls.at(-1)).toEqual({ details: { title: "Drive to My Tuscan Kitchen, Montefoscoli (~1 h)", kind: "food", kind_type: "food", kind_sub: "restaurant" } });
    expect(screen.getByTestId("note-type-button").textContent).toContain("Food");
    const where = screen.getByTestId("note-where");
    expect(where.textContent).toContain("Where? Add a place");
    expect(where.textContent).toContain("optional");
  });

  // 25 Nov 2026: on a note the chip is named Drive (and Train), not Transit. Brennan could not
  // find how to make a card a drive.
  it("Logistics › Drive makes it a drive: 'Where to?'", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("tab", { name: "Logistics" })); });
    expect(within(screen.getByRole("dialog")).queryByRole("radio", { name: /Transit/ })).toBeNull();
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Drive/ })); });
    expect(screen.getByTestId("note-where").textContent).toContain("Where to? Add a place");
  });

  it("Logistics › Train makes it a train: 'Which station?'", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("tab", { name: "Logistics" })); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Train/ })); });
    expect(screen.getByTestId("note-where").textContent).toContain("Which station?");
  });

  it("a typed Activity with no place gets the activity fields behind Add details (11 Nov 2026)", async () => {
    const activity = { ...note, details: { title: "Lucca Wandering — Walls → San Michele", kind: "activity", notes: "Easy." } } as unknown as Card;
    await act(async () => { render(<CardBottomSheet card={activity} onClose={() => {}} days={days} tripDestination="Tuscany, Italy" />); });
    const add = screen.getByRole("button", { name: /Add details/ });
    await act(async () => { fireEvent.click(add); });
    expect(screen.getByText("Cost")).toBeTruthy();
  });

  it("a guest gets no dropdown", async () => {
    await open(true);
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the sheet opens on the note's own group (19 Nov 2026, seen live)", () => {
  it("a Food note typed before kind_type existed opens on Food, not Activity", async () => {
    const food = { ...note, details: { title: "Dinner at the villa", kind: "food" } } as unknown as Card;
    await act(async () => { render(<CardBottomSheet card={food} onClose={() => {}} days={days} tripDestination="Tuscany, Italy" />); });
    await act(async () => { fireEvent.click(screen.getByTestId("note-type-button")); });
    expect(within(screen.getByRole("dialog")).getByRole("tab", { name: "Food" }).getAttribute("aria-selected")).toBe("true");
  });
});
