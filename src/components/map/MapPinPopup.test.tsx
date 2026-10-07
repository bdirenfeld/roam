// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * Removing a pin from the map card. Brennan could not find a way to on his
 * phone (26 Sep 2026): "remove from map" only appeared after tapping "more".
 * It became a bin beside the close; on 6 Oct 2026 (designer audit) the bin
 * left the ✕'s corner and became a quiet "Remove from map" link at the bottom
 * of the card — still always there when removing is allowed, behind the same
 * confirm, and the only door. The host's toast + Undo arrive through
 * onCardDelete, which is what these tests hold on to.
 */

vi.mock("@phosphor-icons/react", () => {
  const Glyph = () => null;
  return { BookmarkSimple: Glyph, CalendarBlank: Glyph, CaretRight: Glyph, Heart: Glyph, PencilSimple: Glyph, Trash: Glyph };
});
vi.mock("@/components/cards/PlacePhotoGallery", () => ({ default: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const del = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedDelete: (...a: unknown[]) => del(...(a as [])) }));
// Taking a pin off its day: the saved copy it makes comes back as "s9".
const unschedule = vi.fn(async () => ({ ok: true, created: { id: "s9" } }));
vi.mock("@/lib/scheduleCard", async (orig) => ({ ...(await orig<object>()), unscheduleCard: () => unschedule() }));

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
  it("shows Remove from map on the card without opening anything first", () => {
    render(<MapPinPopup card={card} onClose={() => {}} onCardDelete={() => {}} onCardUpdate={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove from map" })).toBeTruthy();
    expect(screen.queryByText("remove from map")).toBeNull(); // the old hidden link is gone
  });

  it("asks once, then removes", async () => {
    const onCardDelete = vi.fn();
    render(<MapPinPopup card={card} onClose={() => {}} onCardDelete={onCardDelete} onCardUpdate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove from map" }));
    expect(screen.getByText("Remove this place from your map?")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    await waitFor(() => expect(onCardDelete).toHaveBeenCalledWith("c1"));
  });

  it("offers no Remove where removing is not allowed (a guest's map)", () => {
    render(<MapPinPopup card={card} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Remove from map" })).toBeNull();
  });

  it("Remove is a text link at the bottom, not an icon beside the close", () => {
    render(<MapPinPopup card={card} onClose={() => {}} onCardDelete={() => {}} onCardUpdate={() => {}} />);
    const remove = screen.getByRole("button", { name: "Remove from map" });
    expect(remove.textContent).toBe("Remove from map");
    expect(remove.className).not.toMatch(/absolute/);
    // It comes after the action row's doors in reading order.
    const put = screen.getByLabelText("Directions");
    expect(put.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a scheduled pin's Remove still offers to take it off its day", () => {
    const onDay = { ...card, status: "in_itinerary", day_id: "d1" } as unknown as Card;
    render(<MapPinPopup card={onDay} onClose={() => {}} onCardDelete={() => {}} onCardUpdate={() => {}} days={[{ id: "d1", day_number: 3, date: "2027-08-26" }] as never} tripId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove from map" }));
    expect(screen.getByText(/This place is on Day 3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take it off the day" })).toBeTruthy();
  });

  it("taking it off the day tells the host it was a take-off, with the saved copy, so its toast says so (6 Oct 2026, taps audit)", async () => {
    const onDay = { ...card, status: "in_itinerary", day_id: "d1" } as unknown as Card;
    const onCardDelete = vi.fn();
    render(<MapPinPopup card={onDay} onClose={() => {}} onCardDelete={onCardDelete} onCardUpdate={() => {}} onCardCreated={() => {}} days={[{ id: "d1", day_number: 3, date: "2027-08-26" }] as never} tripId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove from map" }));
    fireEvent.click(screen.getByRole("button", { name: "Take it off the day" }));
    await waitFor(() => expect(onCardDelete).toHaveBeenCalledWith("c1", { savedId: "s9" }));
  });
});

describe("MapPinPopup — the face (6 Oct 2026, designer audit)", () => {
  const mafalda = {
    ...card, id: "c2", source_url: null,
    details: { notes: "**Intent**\nA specialist shop and eating spot in Colonnata, home of the famous cured lard.\n\n**Know before you go**\n- Cash is handy." },
    place: { id: "p2", title: "Mafalda Lardo di Colonnata IGP", type: "food", sub_type: "restaurant", lat: 44.08, lng: 10.15, google_place_id: "g2", rating: 4.7 },
  } as unknown as Card;

  it("one star and 4.7, not five stars", () => {
    render(<MapPinPopup card={mafalda} onClose={() => {}} onCardDelete={() => {}} onCardUpdate={() => {}} />);
    expect(screen.getAllByTestId("rating-star")).toHaveLength(1);
    expect(screen.getByText("4.7")).toBeTruthy();
  });

  it("the name wraps to two lines instead of truncating", () => {
    render(<MapPinPopup card={mafalda} onClose={() => {}} />);
    const h = screen.getByRole("heading", { name: "Mafalda Lardo di Colonnata IGP" });
    expect(h.className).toMatch(/line-clamp-2/);
    expect(h.className).not.toMatch(/\btruncate\b/);
  });

  it("the folded note shows its first sentence, never a raw **Intent**", () => {
    const { container } = render(<MapPinPopup card={mafalda} onClose={() => {}} onCardUpdate={() => {}} />);
    expect(container.textContent).not.toMatch(/\*\*/);
    expect(screen.getByText(/^A specialist shop and eating spot in Colonnata/)).toBeTruthy();
    // Opened, the headings render bold, as on the card sheet.
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(container.textContent).not.toMatch(/\*\*/);
    expect(screen.getByText("Intent").tagName).toBe("STRONG");
  });
});

describe("MapPinPopup — a pin on a day says which (6 Oct 2026, taps audit)", () => {
  const days = [{ id: "d1", day_number: 3, date: "2026-08-25" }] as never;

  it("a scheduled pin shows Day 3 · Tue 25 Aug, linking to that day, and no Put on a day", () => {
    const onDay = { ...card, status: "in_itinerary", day_id: "d1" } as unknown as Card;
    render(<MapPinPopup card={onDay} onClose={() => {}} onCardUpdate={() => {}} days={days} tripId="t1" />);
    const pill = screen.getByRole("link", { name: /Day 3/ });
    expect(pill.textContent).toContain("Tue 25 Aug");
    expect(pill.getAttribute("href")).toBe("/trips/t1/days/d1");
    expect(screen.queryByText("Put on a day")).toBeNull();
  });

  it("a saved pin with no day keeps Put on a day", () => {
    render(<MapPinPopup card={card} onClose={() => {}} onCardUpdate={() => {}} days={days} tripId="t1" />);
    expect(screen.getByText("Put on a day")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Day 3/ })).toBeNull();
  });
});

describe("MapPinPopup — directions remember the app (6 Oct 2026, taps audit)", () => {
  // The disc was a Google place SEARCH (/maps/search/), two more taps to a
  // route. Now it is the card sheet's directions (lib/directions).
  afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

  it("nothing remembered: the chooser opens with Remember my choice, and Google goes straight to the route", () => {
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<MapPinPopup card={card} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: /Remember my choice/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Google Maps/ }));
    expect(open).toHaveBeenCalledWith("https://www.google.com/maps/dir/?api=1&destination=43.84,10.5&destination_place_id=g1", "_blank");
    expect(window.localStorage.getItem("roam:directions-app")).toBe("google");
    expect(screen.queryByRole("switch", { name: /Remember my choice/ })).toBeNull();
  });

  it("an app remembered: one tap opens it on the route, no chooser", () => {
    window.localStorage.setItem("roam:directions-app", "waze");
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<MapPinPopup card={card} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(open).toHaveBeenCalledWith("https://waze.com/ul?ll=43.84,10.5&navigate=yes", "_blank");
    expect(screen.queryByRole("switch", { name: /Remember my choice/ })).toBeNull();
  });

  it("never a Google place search", () => {
    const { container } = render(<MapPinPopup card={card} onClose={() => {}} />);
    expect(container.innerHTML).not.toMatch(/maps\/search/);
  });
});

describe("MapPinPopup — Put on a day goes through the host (7 Oct 2026, taps audit)", () => {
  const days = [{ id: "d1", day_number: 1, date: "2026-08-24" }, { id: "d2", day_number: 2, date: "2026-08-25" }] as never;

  it("with onPutOnDay, a tap on a day hands that day to the host (which times it, with Undo) and closes", async () => {
    const onPutOnDay = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<MapPinPopup card={card} onClose={onClose} onCardUpdate={() => {}} days={days} tripId="t1" onPutOnDay={onPutOnDay} />);
    fireEvent.click(screen.getByRole("button", { name: /Put on a day/ }));
    fireEvent.click(screen.getByRole("button", { name: /Day 2/ }));
    await waitFor(() => expect(onPutOnDay).toHaveBeenCalledWith(expect.objectContaining({ id: "d2" })));
    expect(onClose).toHaveBeenCalled();
  });
});
