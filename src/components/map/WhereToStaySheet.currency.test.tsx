// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Trip, StayCandidate } from "@/types/database";

/**
 * Stay prices in the person's own money (7 Oct 2026). They have been asked
 * for in the home currency since 6 Oct, but the list wrote "$" in front of
 * every one, so a Londoner's pounds read as dollars.
 */

const TRIP = { id: "trip-paris", title: "Paris", start_date: "2027-05-01", end_date: "2027-05-06", party_size: 2, party_ages: [40, 40] } as unknown as Trip;

const row = (o: Partial<StayCandidate> & { id: string; name: string }): StayCandidate => ({
  trip_id: TRIP.id, base: 0, letter: "A", status: "candidate", site: "direct",
  url: "https://example.com/1", total: 1200, nightly_cad: 240, beds: 1, baths: 1, sleeps: 2,
  score: 4.6, score_scale: 5, reviews: 800, reviews_notes: null, flags: [], feel: null,
  photos: [], address: "Paris, France", lat: 48.86, lng: 2.35, source: "google", drive: null, currency: null,
  ...o,
} as unknown as StayCandidate);

let CANDIDATES: StayCandidate[] = [];
let HOME_COUNTRY: string | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "users") return { data: { home_country: HOME_COUNTRY, passport_country: null } };
            if (table === "trip_budgets") return { data: { assumptions: { nightlyRate: 300 } } };
            return { data: null };
          },
          order: async () => ({ data: table === "stay_candidates" ? CANDIDATES : [] }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useEscapeKey", () => ({ useEscapeKey: () => {} }));
vi.mock("./StayCardSheet", () => ({ default: () => <div data-testid="card" /> }));

import WhereToStaySheet from "./WhereToStaySheet";

const mount = () => render(
  <WhereToStaySheet trip={TRIP} placesCount={20} focusedId={null} onFocus={vi.fn()} onCandidates={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()} />,
);

beforeEach(() => {
  HOME_COUNTRY = null;
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }) as unknown as typeof fetch;
});

describe("a stay's price is written in its own currency", () => {
  it("pounds for a Briton: £", async () => {
    HOME_COUNTRY = "United Kingdom";
    CANDIDATES = [row({ id: "a", name: "Hôtel du Marais", currency: "GBP" })];
    mount();
    await screen.findByText("Hôtel du Marais");
    expect(screen.getByText("£1,200")).toBeTruthy();
    expect(screen.queryByText("$1,200")).toBeNull();
  });

  it("US dollars for an American: $", async () => {
    HOME_COUNTRY = "United States";
    CANDIDATES = [row({ id: "a", name: "Hôtel du Marais", currency: "USD" })];
    mount();
    await screen.findByText("Hôtel du Marais");
    expect(screen.getByText("$1,200")).toBeTruthy();
  });

  it("a row with no currency recorded takes the person's home; the budget line follows", async () => {
    HOME_COUNTRY = "United Kingdom";
    CANDIDATES = [row({ id: "a", name: "Hôtel du Marais", currency: null })];
    mount();
    await screen.findByText("Hôtel du Marais");
    expect(await screen.findByText("£1,200")).toBeTruthy();
    expect(await screen.findByText(/up to £300 a night/)).toBeTruthy();
  });

  it("a Canadian sees what they always saw", async () => {
    HOME_COUNTRY = "Canada";
    CANDIDATES = [row({ id: "a", name: "Hôtel du Marais", currency: "CAD" })];
    mount();
    await screen.findByText("Hôtel du Marais");
    expect(screen.getByText("$1,200")).toBeTruthy();
    expect(await screen.findByText(/up to \$300 a night/)).toBeTruthy();
  });
});
