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
    IdeasLink: Row,
    TripSettingsLink: Row,
    useJourneyNotes: () => ({ open: vi.fn() }),
  };
});

// The icon library is thousands of modules; loading it under jsdom hung the
// run for minutes. The rows are what is being tested, not the glyphs.
vi.mock("@phosphor-icons/react", () => {
  const Glyph = () => null;
  return { Coins: Glyph, DotsThree: Glyph, Gear: Glyph, NotePencil: Glyph, ShareNetwork: Glyph, Lightbulb: Glyph, Bed: Glyph };
});

import AppMenu from "./AppMenu";

afterEach(cleanup);

const bookings = [{ key: "bookings", title: "Bookings", sub: "", icon: null, onClick: () => {} }];

function rows(guest: boolean) {
  render(<AppMenu variant="mobile" tripId="t1" tripTitle="Tuscany" guest={guest} extra={bookings} triggerClassName="" />);
  fireEvent.click(screen.getByLabelText("More options"));
  return screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
}

describe("the journey menu", () => {
  it("is six tiles for the owner, Share and Settings as one, phone-short words", () => {
    const r = rows(false);
    expect(r).toEqual(["Budget", "Notes", "Bookings", "Ideas", "Stay", "Settings"]);
  });

  it("is Notes and Bookings for a guest — no planner's Ideas", () => {
    expect(rows(true)).toEqual(["Notes", "Bookings"]);
  });
});
