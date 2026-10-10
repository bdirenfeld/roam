// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/auth-actions", () => ({ signInWithGoogle: vi.fn(), signInWithEmail: vi.fn() }));

import LandingPage from "./LandingPage";
import { DEMO_JOURNEY } from "./landingAtoms";

afterEach(cleanup);

// 23 Sep 2026: a failed sign-in landed on this page saying nothing, and the
// email box existed only at phone width.
describe("the landing page sign-in", () => {
  it("says a sign-in failed when it did", () => {
    render(<LandingPage signInFailed />);
    expect(screen.getAllByText(/That link expired or was already used/).length).toBeGreaterThan(0);
  });

  it("says nothing on an ordinary visit", () => {
    render(<LandingPage />);
    expect(screen.queryByText(/That link expired or was already used/)).toBeNull();
  });

  it("offers email sign-in on both the phone and the computer layouts", () => {
    render(<LandingPage />);
    expect(screen.getAllByLabelText("Email address for a sign-in link")).toHaveLength(2);
  });

  // 10 Oct 2026, landing audit: a stranger could not see the product before the
  // account wall, and the page never said it was free.
  it("opens a real journey without an account, on both layouts", () => {
    render(<LandingPage />);
    const doors = screen.getAllByRole("link", { name: "See a real trip" });
    expect(doors).toHaveLength(2);
    for (const d of doors) expect(d.getAttribute("href")).toBe(DEMO_JOURNEY.href);
    expect(DEMO_JOURNEY.href).toMatch(/^\/journey\/[a-f0-9]{12}$/);
    expect(screen.getAllByText("Free. No card.").length).toBeGreaterThanOrEqual(2);
  });
});
