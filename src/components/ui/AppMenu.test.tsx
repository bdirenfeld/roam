// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * The journey menu, rendered. The rule is six plain rows for the owner
 * (roam-ship / CLAUDE.md); by 23 Sep 2026 it had grown to seven, with Share
 * and Settings as two rows opening the same screen, and a guest was offered
 * Ideas — their own empty page — inside someone else's journey.
 */

type LinkProps = { children: ReactNode; ariaLabel?: string; role?: string };
vi.mock("@/components/overlays/AppOverlays", () => {
  const Row = ({ children, ariaLabel, role }: LinkProps) => (
    <a role={role} aria-label={ariaLabel}>{children}</a>
  );
  return {
    EstimateLink: Row,
    TripSettingsLink: Row,
    useJourneyNotes: () => ({ open: vi.fn() }),
  };
});

// The icon library is thousands of modules; loading it under jsdom hung the
// run for minutes. The rows are what is being tested, not the glyphs.
vi.mock("@phosphor-icons/react", () => {
  const Glyph = () => null;
  return { Coins: Glyph, DotsThree: Glyph, Gear: () => <i data-icon="gear" />, NotePencil: Glyph, ShareNetwork: Glyph, Lightbulb: Glyph, Bed: Glyph, Question: Glyph };
});

const vids = vi.hoisted(() => ({ available: {} as Record<string, number>, markSeen: () => {} }));
vi.mock("@/hooks/useHowToVideos", () => ({
  SUPABASE_BASE: "https://x.supabase.co",
  useHowToVideos: () => ({ ready: true, available: vids.available, seen: {}, markSeen: vids.markSeen }),
}));

import AppMenu from "./AppMenu";
import { JourneyGuidanceContext } from "@/components/onboarding/JourneyGuidanceContext";

afterEach(cleanup);

const bookings = [{ key: "bookings", title: "Bookings", sub: "", icon: null, onClick: () => {} }];

function rows(guest: boolean) {
  render(<AppMenu variant="mobile" tripId="t1" guest={guest} extra={bookings} triggerClassName="" />);
  fireEvent.click(screen.getByLabelText("More options"));
  return screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
}

describe("the journey menu", () => {
  it("is five tiles for the owner: Videos and Walkthrough live inside Help (24 Nov 2026)", () => {
    vids.available = { "first-journey": 1 };
    render(<JourneyGuidanceContext.Provider value={{ resume: () => {}, restart: () => {}, resumable: true }}><AppMenu variant="mobile" tripId="t1" extra={bookings} triggerClassName="" /></JourneyGuidanceContext.Provider>);
    fireEvent.click(screen.getByLabelText("More options"));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent?.trim())).toEqual(["Budget", "Notes", "Bookings", "Settings", "Help"]);
    vids.available = {};
  });

  it("the public sample has no Help: nothing would be in it", () => {
    history.replaceState({}, "", "/demo");
    expect(rows(false)).toEqual(["Budget", "Notes", "Bookings", "Settings"]);
    cleanup();
    history.replaceState({}, "", "/trips/real");
    expect(rows(false)).toContain("Help");
    history.replaceState({}, "", "/");
  });

  it("Settings wears a gear, matching its word (13 Oct 2026)", () => {
    rows(false);
    const settings = screen.getAllByRole("menuitem").find((el) => el.textContent?.trim() === "Settings")!;
    expect(settings.querySelector('[data-icon="gear"]')).not.toBeNull();
  });

  it("is Notes, Bookings and Help for a guest — no planner's Ideas", () => {
    expect(rows(true)).toEqual(["Notes", "Bookings", "Help"]);
  });

  it("has no Stay tile: Where to stay opens from the Stays row of To book in Bookings (6 Oct 2026)", () => {
    expect(rows(false)).not.toContain("Stay");
    expect(screen.queryByRole("menuitem", { name: "Where to stay" })).toBeNull();
  });

  it.each(["mobile", "desktop"] as const)("Help opens the sheet and closes the %s menu; a reply waiting shows on both", async (variant) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ messages: [] }) })));
    const { setHelpUnread } = await import("@/lib/help/unread");
    setHelpUnread(1);
    render(<AppMenu variant={variant} tripId="t1" triggerClassName="" />);
    expect(screen.getAllByTestId("help-dot").length).toBe(1);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Help, new reply" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Help" })).toBeTruthy();
    await screen.findByPlaceholderText(/wrong, missing, or good/);
    setHelpUnread(0);
    vi.unstubAllGlobals();
  });
});
