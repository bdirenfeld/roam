// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * The share screen, rendered. Agreed 26 Sep 2026: a share lands on a
 * journey's map in one tap when a journey is near the place, asks only when
 * none is, and Undo brings the choice back. Coordinates are real (BABAE and
 * Tuscany from the live database; Santorini is near nothing he has planned).
 */

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast, dismiss: vi.fn() }) }));

const PLACES = {
  babae: { placeId: "g-babae", name: "BABAE", address: "Via Santo Spirito, 21r, Firenze", lat: 43.7688, lng: 11.2474, types: ["bar"] },
  oia: { placeId: "g-oia", name: "Oia", address: "Oia, Greece", lat: 36.4618, lng: 25.3753, types: ["locality"] },
};
vi.mock("@/lib/places/predictions", () => ({
  fetchPredictions: vi.fn(async (q: string) =>
    q.startsWith("bab")
      ? [{ place_id: "g-babae", description: "BABAE", structured_formatting: { main_text: "BABAE", secondary_text: "Florence" } }]
      : [{ place_id: "g-oia", description: "Oia", structured_formatting: { main_text: "Oia", secondary_text: "Greece" } }],
  ),
  fetchPlaceDetails: vi.fn(async (id: string) => (id === "g-babae" ? PLACES.babae : PLACES.oia)),
  predMain: (p: { structured_formatting: { main_text: string } }) => p.structured_formatting.main_text,
  predSecondary: (p: { structured_formatting: { secondary_text: string } }) => p.structured_formatting.secondary_text,
}));

const pin = vi.fn();
vi.mock("@/lib/wishlist/pinToJourney", () => ({ pinPlaceToJourney: (...a: unknown[]) => pin(...a) }));
vi.mock("@/lib/wishlist/climate", () => ({
  fetchClimate: vi.fn(async () => null),
  compactAddress: (a: string) => a,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import ShareCatchClient from "./ShareCatchClient";
import type { ShareJourney } from "@/lib/share/journeys";

const journeys: ShareJourney[] = [
  { id: "tus", title: "Tuscany", archived: false, points: [[43.5671, 10.9807], [43.7699, 11.2601]] },
  { id: "ps", title: "Palm Springs", archived: true, points: [[33.8303, -116.5453]] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ suggestion: null }) })));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function typeAndPick(q: string, row: string) {
  fireEvent.change(screen.getByLabelText("Which place is this?"), { target: { value: q } });
  fireEvent.click(await screen.findByText(row));
}

describe("ShareCatchClient", () => {
  it("saves straight to the nearby journey and opens its map with Undo", async () => {
    pin.mockResolvedValue({ ok: true, duplicate: false, placeName: "BABAE", cardId: "card-1" });
    render(<ShareCatchClient link="https://vt.tiktok.com/x/" caption={null} journeys={journeys} wishlist choose={null} />);
    await typeAndPick("babae", "BABAE");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/tus/map?pin=card-1"));
    expect(pin.mock.calls[0]![2]).toBe("tus");
    expect(pin.mock.calls[0]![4]).toBe("https://vt.tiktok.com/x/"); // the TikTok rides on the pin
    const t = toast.mock.calls[0]![0];
    expect(t.message).toBe("BABAE · Tuscany");
    expect(typeof t.undo).toBe("function");
    // Undo sends you back to choose, with the place already known.
    await t.undo();
    expect(push.mock.calls[0]![0]).toContain("choose=g-babae");
  });

  it("says so, without an Undo, when the place is already on the journey", async () => {
    pin.mockResolvedValue({ ok: true, duplicate: true, placeName: "BABAE", cardId: "old" });
    render(<ShareCatchClient link={null} caption={null} journeys={journeys} wishlist choose={null} />);
    await typeAndPick("babae", "BABAE");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/tus/map?pin=old"));
    expect(toast.mock.calls[0]![0]).toEqual({ message: "Already on Tuscany" });
  });

  it("asks where it goes when no journey is near, with nothing else on the screen", async () => {
    render(<ShareCatchClient link={null} caption={null} journeys={journeys} wishlist choose={null} />);
    await typeAndPick("oia", "Oia");
    await screen.findByRole("heading", { name: "Oia" });
    const rows = screen.getAllByRole("button").map((b) => b.textContent);
    expect(rows).toEqual(["Tuscany", "Palm Springs", "Wishlist", "A different place"]);
    expect(pin).not.toHaveBeenCalled();
  });

  it("offers no Wishlist to someone who has none", async () => {
    render(<ShareCatchClient link={null} caption={null} journeys={journeys} wishlist={false} choose={null} />);
    await typeAndPick("oia", "Oia");
    await screen.findByRole("heading", { name: "Oia" });
    expect(screen.queryByText("Wishlist")).toBeNull();
  });

  it("opens straight on the list when Undo sent you back", async () => {
    render(<ShareCatchClient link={null} caption={null} journeys={journeys} wishlist choose="g-babae" />);
    await screen.findByRole("heading", { name: "BABAE" });
    expect(screen.getByText("Tuscany")).toBeTruthy();
    expect(pin).not.toHaveBeenCalled();
  });

  it("shows the place read from the TikTok caption as the first row, before any typing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestion: { placeId: "g-babae", name: "BABAE", address: "Via Santo Spirito, 21r, Firenze" } }),
    })));
    render(<ShareCatchClient link="https://vt.tiktok.com/ZSqJ1G8RJ/" caption={null} journeys={journeys} wishlist choose={null} />);
    expect(await screen.findByText("BABAE")).toBeTruthy();
  });

  it("does not ask TikTok about an Instagram link", async () => {
    render(<ShareCatchClient link="https://www.instagram.com/reel/abc/" caption={null} journeys={journeys} wishlist choose={null} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });
});
