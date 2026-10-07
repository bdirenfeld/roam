// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * Budget, rendered. Until 23 Sep 2026 it had a Save button, and closing with
 * × threw every edit away without a word. It now saves as you go.
 */

const upserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ upsert: (row: Record<string, unknown>) => { upserts.push(row); return Promise.resolve({ error: null }); } }),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@phosphor-icons/react", () => {
  const G = () => null;
  return { CaretLeft: G, CaretDown: G, Check: G, X: G };
});
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(() => Promise.resolve({ error: null })) }));

import EstimateClient from "./EstimateClient";
import { defaultAssumptions } from "@/lib/budget/model";

beforeEach(() => { upserts.length = 0; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function open(onDismiss = vi.fn()) {
  render(
    <EstimateClient
      tripId="t1" tripTitle="Tuscany" initialAssumptions={defaultAssumptions(7, 11)} initialBasis={{}}
      uncostedExcursions={0} rolledExcursionCount={0} fxToCad={1.5} fxSource="live" cardCurrency="EUR"
      excursionItems={[]} excursionFree={0} dateRange="Aug 24 – Sep 4" distanceKm={6800} peak={false}
      variant="overlay" onDismiss={onDismiss}
    />,
  );
  return onDismiss;
}

/** Contingency lives inside the Additional group since 25 Sep 2026. */
function openAdditional() {
  fireEvent.click(screen.getByText("Additional"));
}

describe("Budget saves as you go", () => {
  it("keeps contingency and points inside the Additional group", () => {
    open();
    expect(screen.queryByLabelText("Contingency percent")).toBeNull();
    expect(screen.queryByLabelText("Amount paid with points")).toBeNull();
    openAdditional();
    expect(screen.getByLabelText("Contingency percent")).toBeTruthy();
    expect(screen.getByLabelText("Amount paid with points")).toBeTruthy();
  });

  it("folds the split rows under Sharing, with labels that fit a phone", () => {
    open();
    expect(screen.queryByLabelText("Travellers in the other household")).toBeNull();
    fireEvent.click(screen.getByText("Sharing"));
    expect(screen.getByLabelText("Travellers in the other household")).toBeTruthy();
    expect(screen.getByText("Other travellers")).toBeTruthy();
  });

  it("has no Save button and no explainer line (6 Oct 2026); the total shows once", () => {
    open();
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    expect(screen.queryByText("Changes save as you type.")).toBeNull();
    expect(screen.queryByText("Total", { exact: true })).toBeNull();
  });

  it("writes a change a moment after typing stops", async () => {
    open();
    openAdditional();
    fireEvent.change(screen.getByLabelText("Contingency percent"), { target: { value: "12" } });
    expect(upserts).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(upserts).toHaveLength(1);
    expect((upserts[0].assumptions as { contingencyPct?: number; contingency?: number })).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("closing straight away still saves the change", async () => {
    const done = open();
    openAdditional();
    fireEvent.change(screen.getByLabelText("Contingency percent"), { target: { value: "15" } });
    await act(async () => { fireEvent.click(screen.getByText("Tuscany")); });
    expect(upserts).toHaveLength(1);
    expect(done).toHaveBeenCalled();
  });

  it("closing with nothing changed writes nothing", async () => {
    const done = open();
    await act(async () => { fireEvent.click(screen.getByText("Tuscany")); });
    expect(upserts).toHaveLength(0);
    expect(done).toHaveBeenCalled();
  });
});

describe("Budget uses real numbers (6 Oct 2026)", () => {
  const villa = { flights: [], stays: [{ amount: 9800, currency: "EUR" }], car: [], nightsPaid: 11, nights: 11 };
  const show = (bookedSpend?: typeof villa, a = defaultAssumptions(7, 11)) => render(
    <EstimateClient
      tripId="t1" tripTitle="Tuscany" initialAssumptions={a} initialBasis={{}}
      uncostedExcursions={0} rolledExcursionCount={0} fxToCad={1.5} fxSource="live" cardCurrency="EUR"
      excursionItems={[]} excursionFree={0} dateRange="Aug 24 – Sep 4" distanceKm={6800} peak={false}
      bookedSpend={bookedSpend} variant="overlay" onDismiss={vi.fn()}
    />,
  );

  it("the villa paid in euros is the Accommodation line, marked Booked, with nothing to type", () => {
    show(villa, { ...defaultAssumptions(7, 11), flightPerPerson: 1200 });
    // 9,800 € × 1.5 = $14,700 paid; flights 7 × $1,200 = $8,400 + 10% contingency still estimated.
    expect(screen.getByTestId("estimate-booked").textContent).toBe("booked $14,700 · still estimated $9,240");
    fireEvent.click(screen.getByText("Standard"));
    expect(screen.getByText("Booked")).toBeTruthy();
    expect(screen.queryByLabelText("Accommodation unit cost")).toBeNull();
    expect(screen.getByLabelText("Flights unit cost")).toBeTruthy();
  });

  it("partly booked stays keep the nightly rate for the open nights", () => {
    show({ ...villa, nightsPaid: 7 }, { ...defaultAssumptions(7, 11), nightlyRate: 500 });
    fireEvent.click(screen.getByText("Standard"));
    expect(screen.getByText("Booked · 7 of 11 nights")).toBeTruthy();
    expect(screen.getByLabelText("Accommodation unit cost")).toBeTruthy();
    expect(screen.queryByLabelText("Accommodation nights")).toBeNull();
    // $14,700 paid; 4 open nights × $500 = $2,000 + $200 contingency.
    expect(screen.getByTestId("estimate-booked").textContent).toBe("booked $14,700 · still estimated $2,200");
  });

  it("nothing paid: no booked line at all", () => {
    show();
    expect(screen.queryByTestId("estimate-booked")).toBeNull();
  });
});

// The budget is in the person's own currency (6 Oct 2026): home country,
// then passport, then CAD — read by lib/budget/load and handed in here.
describe("Budget in the person's home currency", () => {
  const paid = { flights: [{ amount: 1000, currency: "USD" }], stays: [], car: [], nightsPaid: 0, nights: 11 };
  const show = (homeCurrency: string | undefined, cardCurrency = "EUR") => render(
    <EstimateClient
      tripId="t1" tripTitle="Tuscany" initialAssumptions={defaultAssumptions(7, 11)} initialBasis={{ flights: "6,800 km" }}
      uncostedExcursions={0} rolledExcursionCount={0} fxToCad={1.16} fxSource="live" cardCurrency={cardCurrency}
      homeCurrency={homeCurrency}
      excursionItems={[]} excursionFree={0} dateRange="Aug 24 – Sep 4" distanceKm={6800} peak={false}
      bookedSpend={paid} variant="overlay" onDismiss={vi.fn()}
    />,
  );

  it("a US person: US dollars paid count as they are, and the rate reads dollars per euro", () => {
    show("USD");
    expect(screen.getByTestId("estimate-booked").textContent).toMatch(/^booked \$1,000 · /);
    fireEvent.click(screen.getByText("Budget assumptions"));
    expect(screen.getByText(/dollars per euro, today's rate/)).toBeTruthy();
  });

  it("a British person: pounds, written £", () => {
    show("GBP");
    // 1,000 US$ through the reference table into pounds: 1000 × 1.379 / 1.865 ≈ £739.
    expect(screen.getByTestId("estimate-booked").textContent).toMatch(/^booked £739 · /);
    fireEvent.click(screen.getByText("Budget assumptions"));
    expect(screen.getByText(/pounds per euro, today's rate/)).toBeTruthy();
  });

  it("no rate row when the journey is priced in the person's own currency", () => {
    show("USD", "USD");
    fireEvent.click(screen.getByText("Budget assumptions"));
    expect(screen.getByLabelText("Exchange rate to the dollar").closest("div")!.className).toContain("hidden");
  });

  it("left out, it is CAD as before: US dollars go through the table", () => {
    show(undefined);
    expect(screen.getByTestId("estimate-booked").textContent).toMatch(/^booked \$1,379 · /);
  });
});

// Suggestions and typed rates in the person's own money (7 Oct 2026).
describe("Budget from this journey, outside Canada", () => {
  const show = (homeCurrency?: string, cadToHome?: number, originLabel?: string) => render(
    <EstimateClient
      tripId="t1" tripTitle="Paris" initialAssumptions={defaultAssumptions(4, 7)} initialBasis={{}}
      uncostedExcursions={0} rolledExcursionCount={0} fxToCad={1.1} fxSource="live" cardCurrency="EUR"
      homeCurrency={homeCurrency} cadToHome={cadToHome} originLabel={originLabel}
      excursionItems={[]} excursionFree={0} dateRange="May 1 – 8" distanceKm={6500} peak={false}
      variant="overlay" onDismiss={vi.fn()}
    />,
  );
  const suggested = async () => {
    fireEvent.click(screen.getByText("Budget from this journey"));
    await act(async () => { vi.advanceTimersByTime(800); });
    return upserts[upserts.length - 1];
  };

  it("an American gets US-dollar prices and the basis says where from", async () => {
    show("USD", 0.725, "New York");
    const row = await suggested();
    const a = row.assumptions as { groceriesPerDay: number; flightPerPerson: number; fxBase: string };
    expect(a.groceriesPerDay).toBe(60);
    expect(a.flightPerPerson).toBe(760);
    expect((row.basis as Record<string, string>).flights).toBe("6,500 km from New York · long-haul");
    expect((row.basis as Record<string, string>).groceries).toBe("$16 per person per day × 4");
  });

  it("a Briton's basis is in pounds", async () => {
    show("GBP", 0.536, "London");
    const row = await suggested();
    expect((row.basis as Record<string, string>).restaurants).toBe("£31 a head × 4");
  });

  it("a Canadian, or nothing said, gets the same figures as before", async () => {
    show();
    const row = await suggested();
    const a = row.assumptions as { groceriesPerDay: number; flightPerPerson: number };
    expect(a.groceriesPerDay).toBe(90);
    expect(a.flightPerPerson).toBe(1050);
    expect((row.basis as Record<string, string>).flights).toBe("6,500 km from Toronto · long-haul");
  });

  it("a typed rate is saved with the currency it is in", async () => {
    show("USD", 0.725, "New York");
    await suggested(); // a suggestion gives the assumptions a basis, and opens them
    fireEvent.change(screen.getByLabelText("Exchange rate to the dollar"), { target: { value: "1.09" } });
    await act(async () => { vi.advanceTimersByTime(800); });
    const row = upserts[upserts.length - 1];
    expect(row.fx_to_cad).toBe(1.09);
    expect(row.assumptions).toMatchObject({ fxTyped: true, fxBase: "USD" });
  });
});
