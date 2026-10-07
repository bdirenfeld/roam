// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, Day } from "@/types/database";

/**
 * ⋯ → Move to day used to close the sheet with no word at all: the card simply
 * vanished from the column. Now it says where it went — "Moved to Wed 25 Aug",
 * the same day label the other toasts use — and Undo puts it back on its
 * original day with its original time and position (7 Oct 2026, taps audit).
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<{ table: string; match: unknown; patch: Record<string, unknown> }> }));
const toasts = vi.hoisted(() => ({ calls: [] as Array<{ message: string; undo?: () => unknown }> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, match: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, match, patch }); return { error: null }; }),
  queuedDelete: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: (t: { message: string; undo?: () => unknown }) => { toasts.calls.push(t); } }) }));
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

const days = [
  { id: "d1", trip_id: "t1", date: "2027-08-24", day_number: 1 },
  { id: "d2", trip_id: "t1", date: "2027-08-25", day_number: 2 },
] as unknown as Day[];

function lunch(): Card {
  return {
    id: "c1", trip_id: "t1", day_id: "d1", place_id: "p1", status: "in_itinerary",
    start_time: "12:45:00", end_time: "14:00:00", confirmed: false, position: 3,
    details: {}, source_url: null,
    place: { id: "p1", title: "Buca di Sant'Antonio", type: "food", sub_type: "restaurant", lat: 43.84, lng: 10.5, details: {} },
  } as unknown as Card;
}

beforeEach(() => { writes.calls = []; toasts.calls = []; });

describe("CardBottomSheet — Move to day says where it went (7 Oct 2026, taps audit)", () => {
  it("toasts the day it moved to, and Undo restores day, time and position", async () => {
    const onCardUpdate = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      render(<CardBottomSheet card={lunch()} onClose={onClose} onCardUpdate={onCardUpdate} onCardDelete={() => {}} days={days} />);
    });
    await userEvent.click(screen.getByLabelText("More options"));
    await userEvent.click(within(screen.getByRole("menu")).getByText("Move to day"));
    await userEvent.click(screen.getByText(/Day 2/));

    expect(onCardUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1", day_id: "d2" }));
    expect(onClose).toHaveBeenCalled();
    const t = toasts.calls.find((c) => c.message.startsWith("Moved to"));
    // One way to name a day: no month inside a one-month journey (7 Oct 2026, re-audit).
    expect(t?.message).toBe("Moved to Wed 25");
    expect(typeof t?.undo).toBe("function");

    await act(async () => { await t!.undo!(); });
    expect(writes.calls).toContainEqual({
      table: "cards", match: { id: "c1" },
      patch: { day_id: "d1", start_time: "12:45:00", end_time: "14:00:00", position: 3 },
    });
    expect(onCardUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1", day_id: "d1", start_time: "12:45:00", position: 3 }));
  });
});
