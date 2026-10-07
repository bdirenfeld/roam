// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The card sheet of a travel leg (7 Oct 2026, mock d13): the title is the
 * route, the sheet shows From and To, the mode and the length, the mode
 * picker writes details.mode, and a transit card with no start offers one.
 * The leg is the G Adventures journey's Day 23 as converted.
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

const days = [{ id: "d23", trip_id: "t1", date: "2027-02-22", day_number: 23 }] as unknown as Day[];

function truck(details: Record<string, unknown> = {}): Card {
  return {
    id: "b7580610", trip_id: "t1", day_id: "d23", place_id: "p-mfuwe", status: "in_itinerary",
    start_time: "06:00:00", end_time: "19:00:00", confirmed: false, position: 0, source_url: null,
    details: {
      title: "Lusaka → Mfuwe", named: true, mode: "drive", mode_label: "Overland truck",
      from: { title: "Lusaka", lat: -15.4154677, lng: 28.2773267 },
      ...details,
    },
    place: {
      id: "p-mfuwe", title: "Mfuwe", type: "logistics", sub_type: "transit",
      address: "Mfuwe, Zambia", lat: -13.2549974, lng: 31.9326952,
      rating: null, price_level: null, hours: null, google_place_id: "g", details: {},
    },
  } as unknown as Card;
}

beforeEach(() => { writes.calls = []; });

describe("CardBottomSheet — a travel leg (7 Oct 2026)", () => {
  it("titles the sheet with the route and shows From, To, the mode and the length", async () => {
    await act(async () => { render(<CardBottomSheet card={truck()} onClose={() => {}} days={days} />); });
    expect(screen.getByRole("heading", { name: "Lusaka → Mfuwe" })).toBeTruthy();
    const panel = screen.getByTestId("travel-leg-panel");
    expect(panel.textContent).toContain("From");
    expect(panel.textContent).toContain("Lusaka");
    expect(panel.textContent).toContain("To");
    expect(panel.textContent).toContain("Mfuwe");
    expect(panel.textContent).toContain("Overland truck · 13h");
    expect(screen.getByRole("radio", { name: "Drive" }).getAttribute("aria-checked")).toBe("true");
  });

  it("the mode picker writes details.mode, and the tour's label gives way to it", async () => {
    await act(async () => { render(<CardBottomSheet card={truck()} onClose={() => {}} days={days} />); });
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Ferry" })); });
    const w = writes.calls.find((c) => c.table === "cards")!;
    expect((w.patch.details as Record<string, unknown>).mode).toBe("ferry");
    expect((w.patch.details as Record<string, unknown>).mode_label).toBeUndefined();
    expect((w.patch.details as Record<string, unknown>).from).toEqual({ title: "Lusaka", lat: -15.4154677, lng: 28.2773267 });
  });

  it("tapping the mode already chosen writes nothing (the tour's words stay)", async () => {
    await act(async () => { render(<CardBottomSheet card={truck()} onClose={() => {}} days={days} />); });
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Drive" })); });
    expect(writes.calls).toHaveLength(0);
  });

  it("a transit card with no start asks where you leave from", async () => {
    await act(async () => { render(<CardBottomSheet card={truck({ from: undefined, title: "Pick up rental car", named: false })} onClose={() => {}} days={days} />); });
    expect(screen.getByRole("button", { name: "Set where this starts" })).toBeTruthy();
  });

  it("a guest sees the leg but cannot change it", async () => {
    await act(async () => { render(<CardBottomSheet card={truck()} onClose={() => {}} days={days} readOnly />); });
    expect(screen.getByTestId("travel-leg-panel").textContent).toContain("Lusaka");
    expect(screen.queryByRole("button", { name: /Change where this starts/ })).toBeNull();
  });
});
