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
  return { Coins: Glyph, DotsThree: Glyph, Gear: Glyph, NotePencil: Glyph, ShareNetwork: Glyph, Lightbulb: Glyph, Bed: Glyph, PlayCircle: Glyph };
});

const vids = vi.hoisted(() => ({ available: {} as Record<string, number>, markSeen: () => {} }));
vi.mock("@/hooks/useHowToVideos", () => ({
  SUPABASE_BASE: "https://x.supabase.co",
  useHowToVideos: () => ({ ready: true, available: vids.available, seen: {}, markSeen: vids.markSeen }),
}));

import AppMenu from "./AppMenu";

afterEach(cleanup);

const bookings = [{ key: "bookings", title: "Bookings", sub: "", icon: null, onClick: () => {} }];

function rows(guest: boolean, noStay = false) {
  render(<AppMenu variant="mobile" tripId="t1" guest={guest} noStay={noStay} extra={bookings} triggerClassName="" />);
  fireEvent.click(screen.getByLabelText("More options"));
  return screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
}

describe("the journey menu", () => {
  it("is six tiles for the owner, Share and Settings as one, phone-short words", () => {
    const r = rows(false);
    expect(r).toEqual(["Budget", "Notes", "Bookings", "Stay", "Settings"]);
  });

  it("is Notes and Bookings for a guest — no planner's Ideas", () => {
    expect(rows(true)).toEqual(["Notes", "Bookings"]);
  });

  it("has no Stay on a cruise: the ship is the stay (27 Sep 2026)", () => {
    expect(rows(false, true)).toEqual(["Budget", "Notes", "Bookings", "Settings"]);
  });
});

describe("Videos in the journey menu (2 Oct 2026, video-placement-mock §5)", () => {
  afterEach(() => { vids.available = {}; });

  it("no video switched on yet: no tile", () => {
    expect(rows(false)).not.toContain("Videos");
  });

  it("a sixth tile for the owner, and a third for a guest", () => {
    vids.available = { "first-journey": 1 };
    expect(rows(false)).toEqual(["Budget", "Notes", "Bookings", "Stay", "Settings", "Videos"]);
    cleanup();
    expect(rows(true)).toEqual(["Notes", "Bookings", "Videos"]);
  });

  it("opens a white sheet listing only what is switched on; a row plays full screen", () => {
    vids.available = { "first-journey": 1, "on-the-trip": 3 };
    rows(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "How-to videos" }));
    const sheet = screen.getByRole("dialog", { name: "How-to videos" });
    const listed = Array.from(sheet.querySelectorAll("button")).map((b) => b.textContent).filter((t) => t);
    expect(listed).toEqual(["Your first journey1 min", "On the trip45 s"]);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /On the trip/ }));
    const video = screen.getByTestId("video-player").querySelector("video")!;
    expect(video.getAttribute("src")).toContain("/how-to-videos/on-the-trip.mp4?v=3");
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.queryByTestId("video-player")).toBeNull();
    expect(screen.getByRole("dialog", { name: "How-to videos" })).toBeTruthy();
  });
});
