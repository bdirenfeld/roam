// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * Removing a pin from the map card. Brennan could not find a way to on his
 * phone (26 Sep 2026): "remove from map" only appeared after tapping "more".
 * It is now a bin beside the close — always there when removing is allowed,
 * behind the same confirm, and the only door.
 */

vi.mock("@phosphor-icons/react", () => {
  const Glyph = () => null;
  return { BookmarkSimple: Glyph, Heart: Glyph, PencilSimple: Glyph, Trash: Glyph };
});
vi.mock("@/components/cards/PlacePhotoGallery", () => ({ default: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const del = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedDelete: (...a: unknown[]) => del(...(a as [])) }));

import MapPinPopup from "./MapPinPopup";
import type { Card } from "@/types/database";

// Shape of a real saved pin (Lucca, from TikTok) on the Tuscany map.
const card = {
  id: "c1",
  trip_id: "t1",
  day_id: null,
  place_id: "p1",
  status: "interested",
  position: 0,
  source_url: "https://vt.tiktok.com/x/",
  details: null,
  place: { id: "p1", title: "Lucca", type: "activity", sub_type: "self_directed", lat: 43.84, lng: 10.5, google_place_id: "g1" },
} as unknown as Card;

// A phone: the card's desktop/phone switch reads this.
window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("MapPinPopup — removing a pin", () => {
  it("shows a bin on the card without opening anything first", () => {
    render(<MapPinPopup card={card} onClose={() => {}} onCardDelete={() => {}} onCardUpdate={() => {}} />);
    expect(screen.getByLabelText("Remove from map")).toBeTruthy();
    expect(screen.queryByText("remove from map")).toBeNull(); // the old hidden link is gone
  });

  it("asks once, then removes", async () => {
    const onCardDelete = vi.fn();
    render(<MapPinPopup card={card} onClose={() => {}} onCardDelete={onCardDelete} onCardUpdate={() => {}} />);
    fireEvent.click(screen.getByLabelText("Remove from map"));
    expect(screen.getByText("Remove this place from your map?")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    await waitFor(() => expect(onCardDelete).toHaveBeenCalledWith("c1"));
  });

  it("offers no bin where removing is not allowed (a guest's map)", () => {
    render(<MapPinPopup card={card} onClose={() => {}} />);
    expect(screen.queryByLabelText("Remove from map")).toBeNull();
  });
});
