// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * Shortening a journey that has plans on the days it drops (27 Sep 2026).
 * It used to refuse and say "move them to another day first"; it now offers
 * to move them to the nearest day that stays, then shorten.
 */

const DAYS = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, date: `2027-07-0${n}`, day_number: n }));
const writes: { table: string; op: string; values?: unknown; key?: unknown }[] = [];
function query(table: string) {
  let sel = "";
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: (s: string) => { sel = s; return q; },
    eq: chain, in: chain, order: chain, not: chain,
    maybeSingle: () => Promise.resolve({ data: null }),
    update: (values: unknown) => ({ eq: (_k: string, key: unknown) => { writes.push({ table, op: "update", values, key }); return Promise.resolve({ error: null }); } }),
    delete: () => ({ in: (_k: string, key: unknown) => { writes.push({ table, op: "delete", key }); return Promise.resolve({ error: null }); } }),
    insert: (values: unknown) => { writes.push({ table, op: "insert", values }); return Promise.resolve({ error: null }); },
    then: (res: (v: unknown) => void) => {
      if (table === "days") return res({ data: DAYS });
      if (sel === "id") return res({ count: 2 });
      if (sel.startsWith("id, day_id")) return res({ data: [{ id: "c4", day_id: "d4", position: 1 }, { id: "c5", day_id: "d5", position: 1 }] });
      if (sel.startsWith("day_id")) return res({ data: [{ day_id: "d3", position: 2 }] });
      return res({ data: null });
    },
  });
  return q;
}
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: (t: string) => query(t) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@phosphor-icons/react", () => ({ Camera: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/share-actions", () => ({
  createShareLink: vi.fn(), revokeShareLink: vi.fn(), removeGuest: vi.fn(),
  loadShareState: vi.fn(() => Promise.resolve({ shareAvailable: true, shareToken: null, guests: [], invites: [] })),
}));
vi.mock("./EntrySection", () => ({ default: () => null }));
vi.mock("@/components/trip/TravellersSection", () => ({ default: () => null }));

import TripSettingsClient from "./TripSettingsClient";
import type { Trip, Day } from "@/types/database";

const trip = { id: "t1", title: "Test", destination: "Lucca, Italy", start_date: "2027-07-01", end_date: "2027-07-05", party_size: 5, cover_image_url: null, share_token: null } as unknown as Trip;

beforeEach(() => { writes.length = 0; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function shortenTo3rd() {
  render(<TripSettingsClient trip={trip} days={DAYS as unknown as Day[]} initialPeople={[]} initialShareToken={null} initialGuests={[]} shareAvailable={false} variant="overlay" />);
  fireEvent.click(screen.getByText("Dates"));
  fireEvent.click(screen.getByRole("button", { name: "1" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await act(async () => { vi.advanceTimersByTime(800); });
  await act(async () => { await Promise.resolve(); });
}

describe("shortening a journey with plans on the dropped days", () => {
  it("says so, deletes nothing, and offers to move them", async () => {
    await shortenTo3rd();
    expect(screen.getByText(/has 2 plans\./)).toBeTruthy();
    expect(writes.filter((w) => w.op === "delete")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Move them to the nearest day and shorten/ })).toBeTruthy();
  });

  it("moving puts them at the end of the new last day, then drops the days", async () => {
    await shortenTo3rd();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Move them to the nearest day/ })); });
    const moves = writes.filter((w) => w.table === "cards" && w.op === "update");
    expect(moves).toEqual([
      { table: "cards", op: "update", values: { day_id: "d3", position: 3 }, key: "c4" },
      { table: "cards", op: "update", values: { day_id: "d3", position: 4 }, key: "c5" },
    ]);
    const del = writes.find((w) => w.op === "delete");
    expect(del?.key).toEqual(["d4", "d5"]);
    expect(writes.indexOf(del!)).toBeGreaterThan(writes.indexOf(moves[1]));
    expect(writes.find((w) => w.table === "trips")?.values).toMatchObject({ start_date: "2027-07-01", end_date: "2027-07-03" });
  });
});
