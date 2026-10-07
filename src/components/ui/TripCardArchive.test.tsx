// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Archive and restore on the Journeys list say what they did (6 Oct 2026, taps
 * audit). The card's ⋯ → Archive folded the journey away with no word, and Past
 * journeys' restore just removed the row. Both now show the app's one toast with
 * Undo, and a failed write says so instead of a console line.
 */

const archiveCalls: { id: string; archived: boolean }[] = [];
let failNext = false;
vi.mock("@/lib/tripArchive", () => ({
  setTripArchived: vi.fn(async (_s: unknown, id: string, archived: boolean) => {
    archiveCalls.push({ id, archived });
    if (failNext) { failNext = false; return "denied"; }
    return null;
  }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), back: vi.fn() }) }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("./TripCover", () => ({ default: () => null }));
vi.mock("./TripCoverEditModal", () => ({ default: () => null }));

import TripCard from "./TripCard";
import PastJourneysList from "@/components/trip/PastJourneysList";
import type { Trip } from "@/types/database";

const trip = {
  id: "t1", title: "Tuscany", destination: "Tuscany, Italy", start_date: "2026-08-25", end_date: "2026-08-29",
  cover_image_url: null, archived: true,
} as unknown as Trip;

beforeEach(() => { archiveCalls.length = 0; failNext = false; toast.mockReset(); refresh.mockReset(); });

describe("TripCard ⋯ → Archive", () => {
  it("archives, then shows '<Trip> archived' with an Undo that restores", async () => {
    render(<TripCard trip={{ ...trip, archived: false } as Trip} />);
    fireEvent.click(screen.getByLabelText("Options for Tuscany"));
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /Archive/ })); });
    expect(archiveCalls).toEqual([{ id: "t1", archived: true }]);
    expect(toast).toHaveBeenCalledTimes(1);
    const opts = toast.mock.calls[0][0];
    expect(opts.message).toBe("Tuscany archived");
    expect(typeof opts.undo).toBe("function");
    await act(async () => { await opts.undo(); });
    expect(archiveCalls.at(-1)).toEqual({ id: "t1", archived: false });
  });

  it("a refused write says so and offers no Undo", async () => {
    failNext = true;
    render(<TripCard trip={{ ...trip, archived: false } as Trip} />);
    fireEvent.click(screen.getByLabelText("Options for Tuscany"));
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: /Archive/ })); });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0].message).toMatch(/Couldn't archive/);
    expect(toast.mock.calls[0][0].undo).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Past journeys restore", () => {
  it("restores, then shows '<Trip> restored' with an Undo that archives again", async () => {
    render(<PastJourneysList trips={[trip]} hrefByTrip={{}} />);
    await act(async () => { fireEvent.click(screen.getAllByLabelText("Restore Tuscany")[0]); });
    expect(archiveCalls).toEqual([{ id: "t1", archived: false }]);
    const opts = toast.mock.calls[0][0];
    expect(opts.message).toBe("Tuscany restored");
    await act(async () => { await opts.undo(); });
    expect(archiveCalls.at(-1)).toEqual({ id: "t1", archived: true });
  });

  it("a refused restore says so", async () => {
    failNext = true;
    render(<PastJourneysList trips={[trip]} hrefByTrip={{}} />);
    await act(async () => { fireEvent.click(screen.getAllByLabelText("Restore Tuscany")[0]); });
    expect(toast.mock.calls[0][0].message).toMatch(/Couldn't restore/);
  });
});
