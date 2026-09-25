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

  it("has no Save button, and says changes save themselves", () => {
    open();
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    expect(screen.getByText("Changes save as you type.")).toBeTruthy();
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
