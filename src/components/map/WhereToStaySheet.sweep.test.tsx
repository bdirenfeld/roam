// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Trip, StayCandidate } from "@/types/database";

/**
 * The second thing that GOES LOOKING.
 *
 * The invariant search invents journeys and checks the maths. This renders
 * the sheet in every awkward STATE — no rows, one row, five, none priced,
 * some priced, one base, four bases, a party of one, a party of nine, a
 * journey with nothing scheduled — and checks the things that must be true of
 * any screen:
 *
 *   • no "undefined", "NaN" or a stray "null" anywhere on it
 *   • no two visible rows carrying the same letter
 *   • every button reachable by name, so nothing is a mystery glyph
 *   • a price, when shown, is always for the base's own nights
 *
 * Brennan found "undefined of Tokyo", "0 days around Tokyo" and two rows
 * labelled A by opening the app. This is the sweep that would have found them
 * first (11 Sept 2026).
 */

const TRIP = {
  id: "t", title: "Test", start_date: "2028-04-02", end_date: "2028-04-15",
  party_size: 5, party_ages: [43, 41, 10, 8, 5],
} as unknown as Trip;

let CANDIDATES: StayCandidate[] = [];
let BRIEF_ROW: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (table === "stay_briefs" ? { data: BRIEF_ROW } : { data: null }),
          order: async () => ({ data: table === "stay_candidates" ? CANDIDATES : [] }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useEscapeKey", () => ({ useEscapeKey: () => {} }));
vi.mock("./StayCardSheet", () => ({ default: () => <div /> }));

import WhereToStaySheet from "./WhereToStaySheet";

const LETTERS = "ABCDEFGHIJ".split("");

function rows(n: number, opts: { base?: number; priced?: boolean; flags?: string[] } = {}): StayCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${opts.base ?? 0}-${i}`, trip_id: TRIP.id, base: opts.base ?? 0, letter: LETTERS[i],
    name: `Place ${opts.base ?? 0}-${i}`, status: "candidate", site: "direct", url: "https://x.test",
    total: opts.priced === false ? null : 1000 + i * 100, nightly_cad: null,
    beds: 2, baths: 1, sleeps: 6, score: 4.6, score_scale: 5, reviews: 120,
    review_notes: null, flags: opts.flags ?? [], feel: null, photos: [], address: "Somewhere",
    lat: 35.6, lng: 139.7, source: "google", drive: { hours: 1, line: "Centre 9 min", minutes: {} },
  } as unknown as StayCandidate));
}

function brief(bases: { label: string; nights: number }[], extra: Record<string, unknown> = {}) {
  const nights = bases.reduce((n, b) => n + b.nights, 0) || 13;
  return {
    trip_id: TRIP.id, area_text: "Around the centre.", split_text: null, price_year: null,
    brief: {
      nights, days: nights + 1, kind: "hotel", radiusMin: 15, stayDays: 2, anchors: [], splitCandidates: [],
      party: { total: 5, adults: 2, kids: 3, seniors: 0, under5: true },
      fit: { bedrooms: 3, baths: 2, askGroundFloor: false, askCot: true },
      evening: { lat: 35.6, lng: 139.7, label: bases[0]?.label ?? "Centre", days: 2, evenings: true },
      bases: bases.map((b, i) => ({ ...b, lat: 35.6 + i, lng: 139.7 + i, km: i * 100, pins: 5 })),
      areaByBase: Object.fromEntries(bases.map((b, i) => [String(i), `Around ${b.label}.`])),
      ...extra,
    },
  };
}

/** Every state worth rendering. */
const STATES: { name: string; rows: StayCandidate[]; brief: Record<string, unknown> | null }[] = [
  { name: "nothing has been searched yet", rows: [], brief: null },
  { name: "one base, no rows", rows: [], brief: brief([{ label: "Lucca", nights: 11 }]) },
  { name: "one base, one row", rows: rows(1), brief: brief([{ label: "Lucca", nights: 11 }]) },
  { name: "one base, five rows", rows: rows(5), brief: brief([{ label: "Lucca", nights: 11 }]) },
  { name: "one base, nothing priced", rows: rows(5, { priced: false }), brief: brief([{ label: "Lucca", nights: 11 }]) },
  { name: "one base, every warning at once", rows: rows(3, { flags: ["Over your Estimate ($480 a night)", "Pool not listed"] }), brief: brief([{ label: "Lucca", nights: 11 }]) },
  { name: "two bases", rows: [...rows(3, { base: 0 }), ...rows(3, { base: 1 })], brief: brief([{ label: "Tokyo", nights: 8 }, { label: "Osaka", nights: 5 }]) },
  { name: "four bases", rows: [...rows(2, { base: 0 }), ...rows(2, { base: 1 }), ...rows(2, { base: 2 }), ...rows(2, { base: 3 })],
    brief: brief([{ label: "Lisbon", nights: 4 }, { label: "Porto", nights: 3 }, { label: "Seville", nights: 3 }, { label: "Granada", nights: 3 }]) },
  { name: "a base with rows and a base with none", rows: rows(4, { base: 0 }), brief: brief([{ label: "Tokyo", nights: 8 }, { label: "Osaka", nights: 5 }]) },
  { name: "a centre won on pins alone, no evenings", rows: rows(3),
    brief: brief([{ label: "Tokyo", nights: 13 }], { evening: { lat: 35.6, lng: 139.7, label: "Tokyo", days: 0, evenings: false } }) },
  { name: "a one-night journey", rows: rows(2), brief: brief([{ label: "Lucca", nights: 1 }]) },
  { name: "a two-month journey", rows: rows(5), brief: brief([{ label: "Lisbon", nights: 60 }]) },
];

const BAD = /undefined|NaN|\bnull\b|\b0 (days|evenings|nights)\b/;

beforeEach(() => {
  global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("every state renders something a person could read", () => {
  for (const state of STATES) {
    it(state.name, async () => {
      CANDIDATES = state.rows;
      BRIEF_ROW = state.brief;
      render(
        <WhereToStaySheet
          trip={TRIP} placesCount={20} focusedId={null}
          onFocus={vi.fn()} onCandidates={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByRole("dialog", { name: "Where to stay" })).toBeInTheDocument());

      // Nothing half-rendered anywhere on the screen.
      const text = document.body.textContent ?? "";
      expect(text, `${state.name}: "${text.slice(0, 160)}"`).not.toMatch(BAD);

      // No two visible rows share a letter — the letters tie a row to its pin.
      const shown = Array.from(document.querySelectorAll("[data-cand]"));
      const badges = shown.map((el) => (el.textContent ?? "").trim().charAt(0));
      expect(new Set(badges).size, `${state.name}: letters ${badges.join("")}`).toBe(badges.length);

      // Every control says what it is, so nothing is a mystery glyph.
      for (const b of Array.from(document.querySelectorAll("button"))) {
        const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
        expect(name.length, `${state.name}: a button with no name`).toBeGreaterThan(0);
      }

      // A price, when shown, is for THIS base's nights.
      const baseNights = (state.brief?.brief as { bases?: { nights: number }[] } | undefined)?.bases?.[0]?.nights;
      if (baseNights && shown.length) {
        for (const el of shown) {
          const m = /for (\d+) nights?/.exec(el.textContent ?? "");
          if (m) expect(Number(m[1]), `${state.name}: row says ${m[1]} nights`).toBe(baseNights);
        }
      }
    });
  }
});
