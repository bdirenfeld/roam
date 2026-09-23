// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/trips" }));

import InstallBanner from "./InstallBanner";

// iPhone Safari is the case that showed on a new person's very first screen.
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the install banner", () => {
  it("stays away on the first visit", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("roam_first_seen")).not.toBeNull();
  });

  it("appears when the person comes back", () => {
    localStorage.setItem("roam_first_seen", String(Date.now() - 24 * 60 * 60 * 1000));
    render(<InstallBanner />);
    expect(screen.getByRole("dialog", { name: "Put Roam on your phone" })).toBeTruthy();
  });

  it("never after Not now", () => {
    localStorage.setItem("roam_first_seen", "1");
    localStorage.setItem("roam_install_banner_v2", "1");
    render(<InstallBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
