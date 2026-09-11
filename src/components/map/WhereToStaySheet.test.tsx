// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, StayCandidate } from "@/types/database";

/**
 * The first test in this repo that opens a screen.
 *
 * Brennan, 11 Sept 2026, after finding four faults by using the app: "every
 * time I look at the UI, I find an issue in like 2 seconds. You run like 200
 * tests and can't find a single one. What's the disconnect?" The disconnect
 * was that nothing here rendered anything. Every case below is a fault he
 * found with his eyes.
 */

// ── the journey: Japan, two bases ────────────────────────────────────────
const TRIP = {
  id: "trip-japan",
  title: "Japan",
  start_date: "2028-04-02",
  end_date: "2028-04-15",
  party_size: 5,
  party_ages: [43, 41, 10, 8, 5],
} as unknown as Trip;

const BASES = [
  { label: "Tokyo", lat: 35.68, lng: 139.76, km: 0, pins: 11, nights: 8 },
  { label: "Osaka", lat: 34.69, lng: 135.5, km: 396, pins: 9, nights: 5 },
];

const row = (o: Partial<StayCandidate> & { id: string; name: string }): StayCandidate => ({
  trip_id: TRIP.id, base: 0, letter: "A", status: "candidate", site: "direct",
  url: "https://example.com/1", total: 2256, nightly_cad: 451, beds: 2, baths: 1, sleeps: 5,
  score: 4.7, score_scale: 5, reviews: 1415, reviews_notes: null, flags: [], feel: null,
  photos: [], address: "Osaka, Japan", lat: 34.69, lng: 135.5, source: "google",
  drive: { hours: 1, line: "Namba 5 min", minutes: {} },
  ...o,
} as unknown as StayCandidate);

const TOKYO_ROWS = [
  row({ id: "t1", name: "Hotel Ryumeikan Tokyo", base: 0, letter: "A", total: 5120 }),
  row({ id: "t2", name: "Sakura Cross Ueno", base: 0, letter: "B", total: 2640 }),
];
const OSAKA_ROWS = [
  row({ id: "o1", name: "Citadines Namba Osaka", base: 1, letter: "A", total: 2256 }),
];

// ── the data the sheet reads ─────────────────────────────────────────────
let CANDIDATES: StayCandidate[] = [];
let BRIEF_ROW: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "stay_briefs" ? { data: BRIEF_ROW } : { data: null },
          order: async () => ({ data: table === "stay_candidates" ? CANDIDATES : [] }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useEscapeKey", () => ({ useEscapeKey: () => {} }));
// The card is its own screen; this file is about the list.
vi.mock("./StayCardSheet", () => ({ default: () => <div data-testid="card" /> }));

import WhereToStaySheet from "./WhereToStaySheet";

function mount(extra: Partial<React.ComponentProps<typeof WhereToStaySheet>> = {}) {
  return render(
    <WhereToStaySheet
      trip={TRIP}
      placesCount={31}
      focusedId={null}
      onFocus={vi.fn()}
      onCandidates={vi.fn()}
      onChanged={vi.fn()}
      onClose={vi.fn()}
      {...extra}
    />,
  );
}

beforeEach(() => {
  CANDIDATES = [...TOKYO_ROWS, ...OSAKA_ROWS];
  BRIEF_ROW = {
    trip_id: TRIP.id,
    area_text: "Most of your places are around Tokyo.",
    split_text: "Too spread out for one base — 2 places to stay.",
    price_year: 2027,
    brief: {
      nights: 13, days: 14, bases: BASES, kind: "hotel",
      party: { total: 5, adults: 2, kids: 3, seniors: 0, under5: true },
      fit: { bedrooms: 3, baths: 2, askGroundFloor: false, askCot: true },
      evening: { lat: 35.68, lng: 139.76, label: "Tokyo", days: 0, evenings: false },
      anchors: [], radiusMin: 15, stayDays: 2, splitCandidates: [],
      areaByBase: { "0": "Most of your places are around Tokyo." },
    },
  };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }) as unknown as typeof fetch;
});

describe("the base switcher", () => {
  it("shows a tab per base, with its nights", async () => {
    mount();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Tokyo8 nights", "Osaka5 nights"]);
  });

  it("shows only the base you are on", async () => {
    mount();
    await screen.findByText("Hotel Ryumeikan Tokyo");
    expect(screen.queryByText("Citadines Namba Osaka")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: /Osaka/ }));
    expect(await screen.findByText("Citadines Namba Osaka")).toBeInTheDocument();
    expect(screen.queryByText("Hotel Ryumeikan Tokyo")).toBeNull();
  });

  // His screenshot: the Osaka tab was showing "West of Tokyo ... most of your
  // places are around Tokyo".
  it("never shows one base's description on another base's tab", async () => {
    mount();
    expect(await screen.findByText(/around Tokyo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Osaka/ }));
    await waitFor(() => expect(screen.queryByText(/around Tokyo/)).toBeNull());
  });
});

describe("what a row says", () => {
  // "The list says for 13 nights on Tokyo, which is 8 nights."
  it("counts the base's nights, not the journey's", async () => {
    mount();
    const row = (await screen.findByText("Hotel Ryumeikan Tokyo")).closest("[data-cand]");
    expect(within(row as HTMLElement).getByText(/for 8 nights/)).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(/13 nights/)).toBeNull();
  });

  // "Outside the area isn't helpful ... it'd be better to have avg review and
  // total reviews." It sat on nearly every Tuscany row and separated nothing.
  it("shows how well a place is rated, and never says Outside the area", async () => {
    mount();
    const el = (await screen.findByText("Hotel Ryumeikan Tokyo")).closest("[data-cand]") as HTMLElement;
    expect(within(el).getByText(/4\.7 from 1,415/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Outside the area/);
  });

  it("still shows a warning that costs money or hours", async () => {
    CANDIDATES = [
      row({ id: "t1", name: "Dear Hotel", base: 0, letter: "A", total: 9999,
            flags: ["Over your Estimate ($480 a night)"] } as Partial<StayCandidate> & { id: string; name: string }),
    ];
    mount();
    const el = (await screen.findByText("Dear Hotel")).closest("[data-cand]") as HTMLElement;
    expect(within(el).getByText(/Over your Estimate/)).toBeInTheDocument();
    expect(within(el).getByText(/4\.7 from 1,415/)).toBeInTheDocument();
  });

  it("never prints undefined or a zero count anywhere on the sheet", async () => {
    mount();
    await screen.findByText("Hotel Ryumeikan Tokyo");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).not.toMatch(/\b0 (days|evenings|nights)\b/);
  });
});

describe("a base that has not searched yet", () => {
  // "When I click on Osaka I don't see any of the hotels" — it was searching,
  // and the list was a white void.
  it("says what it is doing, where the rows will be", async () => {
    CANDIDATES = [...TOKYO_ROWS];                    // Osaka has nothing yet
    // The search must still be in flight when we look — that is the whole
    // point. A resolved fetch would show the finished state.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    mount();
    await screen.findByText("Hotel Ryumeikan Tokyo");
    await userEvent.click(screen.getByRole("tab", { name: /Osaka/ }));
    expect(await screen.findByText(/Looking for places around Osaka/)).toBeInTheDocument();
    // And not a white void: it says how long, too.
    expect(screen.getByText(/take a few seconds/)).toBeInTheDocument();
  });
});

describe("the controls", () => {
  // "No one really knows it's a button."
  it("offers Search again as a button, not as grey text", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Search again" })).toBeInTheDocument();
  });

  // The footer was 227px of a 388px sheet.
  it("keeps the must-haves and the budget folded away until asked for", async () => {
    mount();
    await screen.findByText("Hotel Ryumeikan Tokyo");
    expect(screen.queryByLabelText("What matters here")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Change/ }));
    expect(await screen.findByLabelText("What matters here")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByLabelText("What matters here")).toBeNull());
  });
});

/**
 * "Should it get to a point where you click it and you say there are no more
 * we would recommend and why? Or say that as a warning before continuing, and
 * to pick from the previous list." (Brennan, 11 Sept 2026)
 *
 * These check the SCREEN, not the sentence: the click must not spend a
 * search, and the way back to what he already has must be on it.
 */
describe("when there is nothing left to find", () => {
  function spend() {
    CANDIDATES = [
      ...TOKYO_ROWS,
      row({ id: "t9", name: "Sakura Cross Kayabacho", base: 0, letter: "C", status: "seen" }),
      row({ id: "t8", name: "Under Railway Hotel", base: 0, letter: "D", status: "seen" }),
      ...OSAKA_ROWS,
    ];
    ((BRIEF_ROW as Record<string, unknown>).brief as Record<string, unknown>).spentByBase = { "0": true };
  }

  it("warns instead of searching, and points at the ones he has seen", async () => {
    spend();
    mount();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Where to stay" })).toBeInTheDocument());
    const spy = global.fetch as unknown as { mock: { calls: unknown[] } };
    const before = spy.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Search again" }));

    expect(screen.getByText(/found nothing new around Tokyo/)).toBeInTheDocument();
    expect(screen.getByText(/every place anyone is quoting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show those 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search anyway" })).toBeInTheDocument();
    // The click cost him nothing.
    expect(spy.mock.calls.length).toBe(before);
  });

  it("shows the earlier ones without searching", async () => {
    spend();
    mount();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Where to stay" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Search again" }));
    const spy = global.fetch as unknown as { mock: { calls: unknown[] } };
    const before = spy.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: /Show those 2/ }));

    expect(screen.getByText("Sakura Cross Kayabacho")).toBeInTheDocument();
    expect(spy.mock.calls.length).toBe(before);
  });

  it("still searches when he says to anyway", async () => {
    spend();
    mount();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Where to stay" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Search again" }));
    const spy = global.fetch as unknown as { mock: { calls: unknown[] } };
    const before = spy.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Search anyway" }));

    expect(spy.mock.calls.length).toBeGreaterThan(before);
  });

  it("does not warn on a base that still has ground to cover", async () => {
    spend();
    mount();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Where to stay" })).toBeInTheDocument());
    // Osaka has not been exhausted, so its button just runs.
    await userEvent.click(screen.getByRole("tab", { name: /Osaka/ }));
    await userEvent.click(screen.getByRole("button", { name: "Search again" }));
    expect(screen.queryByText(/found nothing new/)).toBeNull();
  });
});
