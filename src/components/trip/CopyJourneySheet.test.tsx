// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

/**
 * Copy to new dates (7 Oct 2026, mock t07): the sheet (prefills, the end
 * follows the start, the weekday line, the saved-places switch), the doors
 * (past rows and upcoming cards, owner only) and the "To book" mark.
 */

let savedRows: { id: string; status: string; archived: boolean | null; place_id: string | null }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: savedRows, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/tripArchive", () => ({ setTripArchived: vi.fn(async () => null) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push, back: vi.fn() }) }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/ui/TripCover", () => ({ default: () => null }));

import CopyJourneySheet from "./CopyJourneySheet";
import PastJourneysList from "./PastJourneysList";
import TripCard from "@/components/ui/TripCard";
import CardBadges from "@/components/cards/CardBadges";
import type { Card, Trip } from "@/types/database";

const ny = {
  id: "ny", user_id: "me", title: "New York (Mia & Daddy)", destination: "New York", start_date: "2026-07-23", end_date: "2026-07-26",
  party_size: 2, party_ages: [42, 7], cover_image_url: null, archived: false,
} as unknown as Trip;

beforeEach(() => {
  savedRows = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, status: "interested", archived: false, place_id: `p${i}` }));
  savedRows.push({ id: "note", status: "interested", archived: false, place_id: null });
  push.mockReset(); toast.mockReset();
});

describe("the copy sheet", () => {
  it("prefills the name, a start a year on (same weekday), the caption, the weekday line and the party a year older", async () => {
    render(<CopyJourneySheet trip={ny} onClose={vi.fn()} today="2026-10-07" />);
    expect(screen.getByRole("heading").textContent).toBe("Copy New York (Mia & Daddy)");
    expect(screen.getByRole("heading").className).toMatch(/truncate/);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("New York (Mia & Daddy)");
    expect(screen.getByTestId("copy-start").textContent).toContain("Thu 22 Jul 2027");
    expect(screen.getByTestId("copy-caption").textContent).toBe("4 days · Thu 22 Jul – Sun 25 Jul 2027");
    expect(screen.getByText("Last time you started on a Thursday")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Travellers/ }).textContent).toContain("1 adult · 1 kid (8)");
    expect(screen.getByText("Copies every day, place, time and note. Flights and stays come back as placeholders to book.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy trip" })).toBeTruthy();
    expect(await screen.findByRole("switch", { name: "Bring the 3 places saved on the map" })).toBeTruthy();
  });

  it("picking a new start moves the end with it, same length", () => {
    render(<CopyJourneySheet trip={ny} onClose={vi.fn()} today="2026-10-07" />);
    fireEvent.click(screen.getByTestId("copy-start"));
    fireEvent.click(within(screen.getByTestId("copy-calendar")).getByRole("button", { name: "Fri 30 Jul 2027" }));
    expect(screen.queryByTestId("copy-calendar")).toBeNull();
    expect(screen.getByTestId("copy-caption").textContent).toBe("4 days · Fri 30 Jul – Mon 2 Aug 2027");
  });

  it("no saved places: no switch", async () => {
    savedRows = [];
    render(<CopyJourneySheet trip={ny} onClose={vi.fn()} today="2026-10-07" />);
    await act(async () => {});
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("Copy trip sends the choices, goes to Day 1 and says what was copied", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ tripId: "new", firstDayId: "day1", counts: { days: 4, places: 19 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<CopyJourneySheet trip={ny} onClose={onClose} today="2026-10-07" />);
    const sw = await screen.findByRole("switch");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New York (Bodhi & Daddy)" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy trip" })); });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ tripId: "ny", title: "New York (Bodhi & Daddy)", startDate: "2027-07-22", partySize: 2, partyAges: [43, 8], includeSaved: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/new/days/day1"));
    expect(onClose).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ message: "Copied · 4 days, 19 places" });
    vi.unstubAllGlobals();
  });

  it("a refused copy keeps the sheet and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Couldn't copy this journey. Nothing was created. Try again." }) })));
    const onClose = vi.fn();
    render(<CopyJourneySheet trip={ny} onClose={onClose} today="2026-10-07" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy trip" })); });
    expect(toast.mock.calls[0][0].message).toMatch(/Nothing was created/);
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("the doors", () => {
  const items = () => screen.getAllByRole("menuitem").map((b) => b.textContent?.trim());

  it("a past row has a ⋯: Copy to new dates / Archive / Delete…, each 44px", () => {
    render(<PastJourneysList trips={[ny]} hrefByTrip={{}} userId="me" />);
    fireEvent.click(screen.getAllByLabelText("Options for New York (Mia & Daddy)")[0]);
    expect(items()).toEqual(["Copy to new dates", "Archive", "Delete…"]);
    for (const b of screen.getAllByRole("menuitem")) expect(b.className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy to new dates/ }));
    expect(screen.getByTestId("copy-journey-sheet")).toBeTruthy();
  });

  it("someone else's past journey offers no copy", () => {
    render(<PastJourneysList trips={[ny]} hrefByTrip={{}} userId="guest" />);
    fireEvent.click(screen.getAllByLabelText("Options for New York (Mia & Daddy)")[0]);
    expect(items()).toEqual(["Archive", "Delete…"]);
  });

  it("an archived past row keeps Restore and its menu has no Archive", () => {
    render(<PastJourneysList trips={[{ ...ny, archived: true } as Trip]} hrefByTrip={{}} userId="me" />);
    expect(screen.getAllByLabelText("Restore New York (Mia & Daddy)").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByLabelText("Options for New York (Mia & Daddy)")[0]);
    expect(items()).toEqual(["Copy to new dates", "Delete…"]);
  });

  it("an upcoming card's ⋯ leads with Copy to new dates for the owner only", () => {
    const { unmount } = render(<TripCard trip={ny} owner />);
    fireEvent.click(screen.getByLabelText("Options for New York (Mia & Daddy)"));
    expect(items()).toEqual(["Copy to new dates", "Archive", "Delete…"]);
    unmount();
    render(<TripCard trip={ny} />);
    fireEvent.click(screen.getByLabelText("Options for New York (Mia & Daddy)"));
    expect(items()).toEqual(["Archive", "Delete…"]);
  });
});

describe("the To book mark", () => {
  const c = (o: Partial<Card>) => ({ id: "c", confirmed: false, details: {}, ...o }) as Card;
  it("shows on a copied placeholder until it is booked", () => {
    const { rerender } = render(<CardBadges card={c({ details: { to_book: true } as Card["details"] })} />);
    expect(screen.getByLabelText("To book")).toBeTruthy();
    rerender(<CardBadges card={c({ confirmed: true, details: { to_book: true } as Card["details"] })} />);
    expect(screen.queryByLabelText("To book")).toBeNull();
    expect(screen.getByLabelText("Booked")).toBeTruthy();
  });
});
