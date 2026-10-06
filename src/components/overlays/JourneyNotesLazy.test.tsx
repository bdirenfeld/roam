// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

/**
 * Phone speed (5 Oct 2026): the journey notes sheet — and @dnd-kit with it —
 * left the first-load bundle of every (app) route and now loads through
 * next/dynamic when opened. This renders it the way the app does (open() on the
 * app-wide provider, the real JourneyNotes module behind the dynamic import)
 * and drags a note, so a broken lazy import or a reorder that no longer
 * reaches dnd-kit fails here rather than on Brennan's phone.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/trips/t1/days/d1",
}));

// Thousands of modules under jsdom; the rows are under test, not the glyphs.
vi.mock("@phosphor-icons/react", () => {
  const Glyph = () => null;
  return { CaretRight: Glyph, Check: Glyph, DotsSixVertical: Glyph, Plus: Glyph, X: Glyph };
});

const saves = vi.hoisted(() => [] as (string | null)[]);
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (row: { notes: string | null }) => ({
        eq: () => { saves.push(row.notes); return Promise.resolve({ error: null }); },
      }),
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { notes: "" }, error: null }) }) }),
    }),
  }),
}));

import { AppOverlaysProvider, useJourneyNotes } from "./AppOverlays";

function Opener() {
  const { open } = useJourneyNotes();
  return <button onClick={() => open("t1", "First\nSecond\nThird")}>Open notes</button>;
}

// jsdom lays nothing out, so every rect is zero and dnd-kit cannot tell one row
// from another. Give each note row (the element useSortable measures: the one
// holding a "Reorder …" handle) a 40px band in list order.
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  saves.length = 0;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const rows = Array.from(document.querySelectorAll('button[aria-label^="Reorder"]')).map((b) => b.parentElement);
    const i = rows.indexOf(this as HTMLElement);
    if (i < 0) return realRect.call(this);
    const top = i * 40;
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 40, width: 300, height: 40, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

const order = () =>
  screen.getAllByRole("button", { name: /^Reorder / }).map((b) => b.getAttribute("aria-label")!.replace("Reorder ", ""));

describe("journey notes, loaded on demand", () => {
  // The first open transforms the real JourneyNotes module, which is slow on a
  // busy machine; the wait is for that, not for the app.
  it("opens from the app-wide provider and lists the notes", { timeout: 30_000 }, async () => {
    render(<AppOverlaysProvider><Opener /></AppOverlaysProvider>);
    expect(screen.queryByRole("dialog", { name: "Journey notes" })).toBeNull();
    fireEvent.click(screen.getByText("Open notes"));
    expect(await screen.findByRole("dialog", { name: "Journey notes" }, { timeout: 15_000 })).toBeInTheDocument();
    expect(order()).toEqual(["First", "Second", "Third"]);
  });

  it("drags a note to a new place on the first try, and saves the new order", { timeout: 30_000 }, async () => {
    render(<AppOverlaysProvider><Opener /></AppOverlaysProvider>);
    fireEvent.click(screen.getByText("Open notes"));
    await screen.findByRole("dialog", { name: "Journey notes" }, { timeout: 15_000 });

    const handle = screen.getByRole("button", { name: "Reorder First" });
    // useSortable puts its attributes on the handle: dnd-kit is wired, not stubbed.
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");

    await act(async () => {
      fireEvent.mouseDown(handle, { button: 0, clientX: 10, clientY: 20 });
      fireEvent.mouseMove(document, { clientX: 10, clientY: 30 }); // past the 6px activation
      fireEvent.mouseMove(document, { clientX: 10, clientY: 100 }); // over Third's band
    });
    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 10, clientY: 100 });
    });

    await waitFor(() => expect(order()).toEqual(["Second", "Third", "First"]));
    await waitFor(() => expect(saves.at(-1)).toBe("Second\nThird\nFirst"));
  });
});
