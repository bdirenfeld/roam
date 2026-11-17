// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * The map's door on a narrow window (17 Nov 2026, Don's feedback). The week's
 * map panel is `hidden lg:block`, so between md and lg an owner had no map,
 * no Find places and no Plan my trip. The masthead now carries a "Map" link
 * on the week, hidden from lg where the panel is already there.
 */

const state = vi.hoisted(() => ({ path: "/trips/t1/plan", guest: false }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/trip-access-client", () => ({ isTripGuest: () => Promise.resolve(state.guest) }));
vi.mock("@/lib/auth-actions", () => ({ signOut: vi.fn() }));
vi.mock("@phosphor-icons/react", () => { const I = () => null; return { UserCircle: I, Calendar: I, Columns: I, MapPin: I, Plus: I, Files: I }; });
vi.mock("@/components/trip/SharedWithFaces", () => ({ default: () => null }));
vi.mock("@/components/ui/AppMenu", () => ({ default: () => null }));
vi.mock("@/components/ui/TripCalendar", () => ({ default: () => null }));
vi.mock("@/components/overlays/AppOverlays", () => ({ NewJourneyLink: () => null, ProfileLink: () => null }));
vi.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const k of ["from", "select", "eq", "order", "not", "is", "in", "limit"]) chain[k] = self;
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
  return { createClient: () => chain };
});

import DesktopMasthead from "./DesktopMasthead";

async function mount() {
  await act(async () => { render(<DesktopMasthead />); });
}

beforeEach(() => {
  state.path = "/trips/t1/plan"; state.guest = false;
  // The guests' Agenda / Map tabs measure their sliding thumb.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("DesktopMasthead: the Map link on a narrow window", () => {
  it("on the owner's week it links to the full map and hides from lg", async () => {
    await mount();
    const link = screen.getByTestId("open-map");
    expect(link.getAttribute("href")).toBe("/trips/t1/map");
    expect(link.className).toContain("lg:hidden");
    expect(link.textContent).toBe("Map");
  });

  it("not off the week, and not for a guest (guests keep their Agenda / Map tabs)", async () => {
    state.path = "/trips/t1/days/d1";
    await mount();
    expect(screen.queryByTestId("open-map")).toBeNull();
  });

  it("not for a guest on the week", async () => {
    state.guest = true;
    await mount();
    expect(screen.queryByTestId("open-map")).toBeNull();
  });
});
