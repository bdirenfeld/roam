// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The blank card the week's hour menu opens (26 Nov 2026). Brennan: "some
 * times you will know the place and some times you won't", so the card offers
 * both at once: Where? Add a place, and the kinds in a row under it. And a
 * kind has to bring its own detail fields, which a place-less card never did
 * (every Food was a restaurant, every Activity an Explore).
 */

const writes = vi.hoisted(() => ({ calls: [] as { table: string; patch: Record<string, unknown> }[] }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, _w: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, patch }); return { error: null }; }),
  queuedInsert: vi.fn(async () => ({ error: null })), queuedDelete: vi.fn(async () => ({ error: null })),
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
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));

import CardBottomSheet from "./CardBottomSheet";

const days = [{ id: "d1", trip_id: "t1", date: "2027-08-25", day_number: 1 }] as unknown as Day[];
const blank = (details: Record<string, unknown>): Card => ({
  id: "c1", trip_id: "t1", day_id: "d1", place_id: null, place: null, status: "in_itinerary",
  start_time: "11:00:00", end_time: "12:00:00", confirmed: false, position: 0, source_url: null, details,
} as unknown as Card);
async function open(card: Card, readOnly = false) {
  await act(async () => { render(<CardBottomSheet card={card} onClose={() => {}} days={days} readOnly={readOnly} />); });
}
const lastDetails = () => writes.calls.filter((c) => c.table === "cards").pop()!.patch.details as Record<string, unknown>;
beforeEach(() => { writes.calls = []; });

describe("a blank card from the week's hour menu", () => {
  it("has a name to type, Where? Add a place, and the kinds in a row", async () => {
    await open(blank({ kind: "food" }));
    expect(screen.getByPlaceholderText("Name it")).toBeTruthy();
    expect(screen.getByTestId("note-where").textContent).toContain("Add a place");
    const kinds = screen.getByTestId("blank-kinds");
    expect(kinds.textContent).toContain("know the place yet?");
    expect(Array.from(kinds.querySelectorAll("button")).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Restaurant", "Coffee", "Bar", "Bakery"]));
  });

  it("a kind picked from the row is saved as the card's sub-type, and the row goes", async () => {
    await open(blank({ kind: "activity" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tour" })); });
    expect(lastDetails()).toMatchObject({ kind: "activity", kind_type: "activity", kind_sub: "guided" });
    expect(screen.queryByTestId("blank-kinds")).toBeNull();
  });

  it("Logistics leaves Transit out of the row: Travel is its own door", async () => {
    await open(blank({ kind: "logistics" }));
    const labels = Array.from(screen.getByTestId("blank-kinds").querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toContain("Hotel");
    expect(labels).not.toContain("Transit");
  });

  it("the name he types is saved as the card's own title", async () => {
    await open(blank({ kind: "food" }));
    const input = screen.getByPlaceholderText("Name it");
    fireEvent.change(input, { target: { value: "Dinner near the Duomo" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(lastDetails()).toMatchObject({ kind: "food", title: "Dinner near the Duomo" });
  });

  it("a card that already had a name when it opened does not grow the row (his Dinner at the villa)", async () => {
    await open(blank({ kind: "food", title: "Dinner at the villa" }));
    expect(screen.queryByTestId("blank-kinds")).toBeNull();
    expect(screen.getByText("Dinner at the villa")).toBeTruthy();
  });

  it("a guest sees no row and no box to type in", async () => {
    await open(blank({ kind: "food" }), true);
    expect(screen.queryByTestId("blank-kinds")).toBeNull();
    expect(screen.queryByPlaceholderText("Name it")).toBeNull();
  });
});

describe("a kind brings its own details, with no place attached", () => {
  it("a Tour asks for a meeting point; an Explore does not", async () => {
    await open(blank({ kind: "activity", kind_type: "activity", kind_sub: "guided", title: "Morning tour" }));
    await act(async () => { fireEvent.click(screen.getByText("Add details")); });
    const tour = document.body.textContent!.toLowerCase();
    expect(tour).toContain("meeting");
  });

  it("every Activity and Food kind opens with its details showing and does not throw", async () => {
    const kinds: [string, string][] = [
      ...["guided", "challenge", "self_directed", "wellness", "event", "beach", "camp", "shopping", "museum", "hike", "park", "zoo", "theme_park"].map((s) => ["activity", s] as [string, string]),
      ...["restaurant", "coffee", "dessert", "bar", "bakery", "market"].map((s) => ["food", s] as [string, string]),
    ];
    for (const [t, st] of kinds) {
      const { unmount } = render(<CardBottomSheet card={blank({ kind: t, kind_type: t, kind_sub: st, title: "x" })} onClose={() => {}} days={days} />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { fireEvent.click(screen.getByText("Add details")); });
      expect(screen.getByText("Hide empty fields"), `${t}/${st}`).toBeTruthy();
      unmount();
    }
  });
});
