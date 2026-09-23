// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/auth-actions", () => ({ signInWithGoogle: vi.fn(), signInWithEmail: vi.fn() }));

import LandingPage from "./LandingPage";

afterEach(cleanup);

// 23 Sep 2026: a failed sign-in landed on this page saying nothing, and the
// email box existed only at phone width.
describe("the landing page sign-in", () => {
  it("says a sign-in failed when it did", () => {
    render(<LandingPage signInFailed />);
    expect(screen.getAllByText(/That sign-in didn't work/).length).toBeGreaterThan(0);
  });

  it("says nothing on an ordinary visit", () => {
    render(<LandingPage />);
    expect(screen.queryByText(/That sign-in didn't work/)).toBeNull();
  });

  it("offers email sign-in on both the phone and the computer layouts", () => {
    render(<LandingPage />);
    expect(screen.getAllByLabelText("Email address for a sign-in link")).toHaveLength(2);
  });
});
