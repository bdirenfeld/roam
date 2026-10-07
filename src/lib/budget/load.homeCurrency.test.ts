import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadEstimate, typedRateToHome } from "./load";

/**
 * The Estimate for someone who does not live in Canada (7 Oct 2026): a typed
 * rate was always read as Canadian dollars per euro, distances came from
 * Toronto, and the suggested prices were CAD. No network: both live rate
 * sources fail, so the dated reference table is what converts.
 */

beforeEach(() => {
  global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const TRIP = {
  id: "t1", title: "Paris", destination: "Paris, France", start_date: "2027-05-01", end_date: "2027-05-08",
  party_size: 2, destination_lat: 48.8566, destination_lng: 2.3522, cruise: false, booking_checklist: null,
};

/** A Supabase stand-in: every table answers one fixed result, however it is queried. */
function client(user: Record<string, unknown> | null, saved: Record<string, unknown> | null) {
  const result = (table: string, one: boolean) => {
    if (table === "trips") return { data: TRIP };
    if (table === "users") return { data: user };
    if (table === "trip_budgets") return { data: one ? saved : [] };
    if (table === "days") return { data: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, date: `2027-05-0${i + 1}` })) };
    return { data: [] };
  };
  const builder = (table: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "not", "order", "limit"]) b[m] = () => b;
    b.single = async () => result(table, true);
    b.maybeSingle = async () => result(table, true);
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(result(table, false)).then(ok);
    return b;
  };
  return { from: builder };
}

const CANADIAN = { home_airport: "YYZ", home_country: "Canada", passport_country: "Canada" };
const AMERICAN = { home_airport: null, home_country: "United States", passport_country: null };
const BRITON = { home_airport: "LHR", home_country: "United Kingdom", passport_country: null };

describe("a typed exchange rate", () => {
  it("a Canadian's rate saved before the base was recorded stays exactly as typed", async () => {
    const d = (await loadEstimate(client(CANADIAN, { trip_id: "t1", fx_to_cad: 1.62, assumptions: { fxTyped: true }, basis: {} }), "t1", "u1"))!;
    expect(d.fxSource).toBe("typed");
    expect(d.fxToCad).toBe(1.62);
    expect(d.homeCurrency).toBe("CAD");
  });

  it("an old rate (no base: Canadian dollars per euro) is carried into an American's dollars", async () => {
    const d = (await loadEstimate(client(AMERICAN, { trip_id: "t1", fx_to_cad: 1.62, assumptions: { fxTyped: true }, basis: {} }), "t1", "u1"))!;
    expect(d.fxSource).toBe("typed");
    // 1.62 CAD per euro × (1 / 1.379 USD per CAD) = 1.175 USD per euro, not 1.62.
    expect(d.fxToCad).toBeCloseTo(1.175, 3);
  });

  it("a rate typed in the person's own currency is used as typed", async () => {
    const d = (await loadEstimate(client(AMERICAN, { trip_id: "t1", fx_to_cad: 1.09, assumptions: { fxTyped: true, fxBase: "USD" }, basis: {} }), "t1", "u1"))!;
    expect(d.fxToCad).toBe(1.09);
    expect(d.fxSource).toBe("typed");
  });

  it("a base nothing can convert is set aside for today's rate rather than misread", async () => {
    expect(await typedRateToHome(2, "XXX", "USD")).toBeNull();
    const d = (await loadEstimate(client(AMERICAN, { trip_id: "t1", fx_to_cad: 2, assumptions: { fxTyped: true, fxBase: "XXX" }, basis: {} }), "t1", "u1"))!;
    expect(d.fxSource).toBe("reference");
  });
});

describe("where the distance starts, and what the suggestions are in", () => {
  it("a Canadian: from Toronto, CAD at 1, as before", async () => {
    const d = (await loadEstimate(client(CANADIAN, null), "t1", "u1"))!;
    expect(d.originLabel).toBe("Toronto");
    expect(d.cadToHome).toBe(1);
    expect(d.distanceKm).toBeGreaterThan(6000);
  });

  it("nobody signed in: Toronto and CAD", async () => {
    const d = (await loadEstimate(client(null, null), "t1", null))!;
    expect(d.originLabel).toBe("Toronto");
    expect(d.cadToHome).toBe(1);
  });

  it("a Briton: from London, a short hop, priced in pounds", async () => {
    const d = (await loadEstimate(client(BRITON, null), "t1", "u1"))!;
    expect(d.originLabel).toBe("London");
    expect(d.distanceKm).toBeLessThan(800);
    expect(d.homeCurrency).toBe("GBP");
    expect(d.cadToHome).toBeCloseTo(1 / 1.865, 3);
  });

  it("an American: from New York, CAD priors scaled into US dollars", async () => {
    const d = (await loadEstimate(client(AMERICAN, null), "t1", "u1"))!;
    expect(d.originLabel).toBe("New York");
    expect(d.cadToHome).toBeCloseTo(1 / 1.379, 3);
  });
});
