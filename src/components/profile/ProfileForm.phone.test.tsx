// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Profile on the phone (26 Nov 2026). It was a three-column grid of small labels
 * with a far-off Edit, then a scatter of five text links in two greys. Brennan's
 * rulings, in order: the facts one a row; no "only you see your home address"
 * line ("distracting and annoying"); Help is not a row "just sitting there" but
 * the "?" in the corner; How Roam works is not here (it is in Help); Sign out is
 * a button; Delete account stays (the law, Google's review, and /privacy all say
 * Profile → Delete account) but small and last.
 */

const help = vi.hoisted(() => ({ opened: 0 }));
vi.mock("@/lib/help/unread", () => ({ openHelp: () => { help.opened++; }, useHelpUnread: () => 0 }));
vi.mock("@/components/help/HelpDot", () => ({ default: () => null }));
vi.mock("@/components/help/AdminDoor", () => ({ default: ({ className }: { className?: string }) => <a href="/admin/feedback" data-testid="admin-door" className={className}>Feedback inbox</a> }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import ProfileForm from "./ProfileForm";

const initial = { userId: "u1", email: "b@example.com", displayName: "Brennan Direnfeld", avatarUrl: null, homeAirport: "YYZ", homeCountry: "Canada", passportCountry: "Canada", homeAddress: "19 Cedar Springs Grove, North York, ON" };
beforeEach(() => { help.opened = 0; });
const show = (onDismiss = () => {}) => render(<ProfileForm variant="overlay" initial={initial} onDismiss={onDismiss} />);

describe("Profile on the phone", () => {
  it("the four facts are one a row, label then value, and a tap on them edits", () => {
    show();
    const rows = screen.getByTestId("profile-rows");
    expect(rows.textContent).toBe("Home airportYYZHome countryCanadaPassportCanadaHome address19 Cedar Springs Grove, North York, ON");
    fireEvent.click(rows);
    expect(screen.queryByTestId("profile-rows")).toBeNull();
    expect(screen.getByDisplayValue("YYZ")).toBeTruthy();
  });

  it("says nothing about who sees the home address on the phone's rows", () => {
    show();
    expect(screen.getByTestId("profile-rows").textContent).not.toMatch(/only you/i);
  });

  it("Help is the ? in the corner: it opens Help over Profile, which stays (the way back)", () => {
    let closed = 0;
    show(() => { closed++; });
    fireEvent.click(screen.getByTestId("profile-help"));
    expect(help.opened).toBe(1);
    expect(closed).toBe(0);
    expect(screen.getByTestId("profile-rows")).toBeTruthy();
    // …and is not also a row in the list
    expect(Array.from(screen.getByTestId("profile-list").querySelectorAll("button")).filter((b) => !b.classList.contains("hidden")).map((b) => b.textContent)).not.toContain("Help");
  });

  it("How Roam works is not on Profile", () => {
    show();
    expect(screen.queryByText("How Roam works")).toBeNull();
  });

  it("Sign out is a button of its own; Delete account and his inbox link are small, after it", () => {
    show();
    const out = screen.getByTestId("profile-sign-out");
    expect(out.textContent).toBe("Sign out");
    expect(out.className).toContain("rounded-full");
    const small = screen.getByTestId("profile-small-links");
    expect(out.compareDocumentPosition(small) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(small.textContent).toContain("Delete account");
    expect(small.textContent).toContain("Feedback inbox");
  });

  // 26 Nov 2026: the computer's Profile window is this same screen ("the phone view is
  // basically what we should use for desktop"). jsdom has no widths, so the test is that
  // nothing here is hidden at md and the old computer-only pieces are gone.
  it("the computer's window shows the same rows, Sign out and Delete account (nothing md:hidden)", () => {
    show();
    for (const id of ["profile-rows", "profile-list", "profile-sign-out", "profile-small-links", "profile-help"]) {
      for (let el: HTMLElement | null = screen.getByTestId(id); el; el = el.parentElement) {
        expect(el.className, id).not.toMatch(/(^|\s)md:hidden(\s|$)/);
      }
    }
    expect(screen.queryByText("Travel profile")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(document.body.textContent).not.toMatch(/only you see/i);
    expect(document.body.textContent).not.toContain("—");
  });

  it("Delete account still asks before it does anything", () => {
    show();
    fireEvent.click(screen.getByText("Delete account"));
    expect(screen.getByText(/can.t be undone/)).toBeTruthy();
  });
});
