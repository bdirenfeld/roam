// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// The paywall on Plan a journey (24 Nov 2026): first journey free, then $5.
// The client below answers like Supabase would for one signed-in traveller.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const world = { paid: false, owned: [] as { title: string }[] };
vi.mock("@/lib/supabase/client", () => {
  const make = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["select", "not", "order", "limit", "eq", "in"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: table === "users" ? { has_paid: world.paid } : null, error: null });
    chain.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "trips" ? world.owned : [], error: null }).then(ok);
    return chain;
  };
  return {
    createClient: () => ({
      from: make,
      auth: {
        getClaims: () => Promise.resolve({ data: { claims: { sub: "u1", email: "a@b.c" } }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    }),
  };
});

import NewJourneyForm from "./NewJourneyForm";

beforeEach(() => {
  world.paid = false;
  world.owned = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});

async function open() {
  await act(async () => { render(<NewJourneyForm variant="overlay" onDismiss={vi.fn()} />); });
}

describe("Plan a journey — the paywall", { timeout: 20000 }, () => {
  it("a new traveller gets the form, not the paywall", async () => {
    await open();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("journey-paywall")).toBeNull();
    expect(screen.getByText("Plan this journey")).toBeTruthy();
  });

  it("with one journey and no payment, the paywall asks for $5 and links to checkout", async () => {
    world.owned = [{ title: "Hanoi March 2027" }];
    await open();
    await waitFor(() => expect(screen.getByTestId("journey-paywall")).toBeTruthy());
    const unlock = screen.getByText("Unlock for $5").closest("a");
    expect(unlock?.getAttribute("href")).toBe("/checkout");
    expect(screen.getByText("Plan this journey").closest(".hidden")).toBeTruthy();
  });

  it("someone who paid is never stopped", async () => {
    world.paid = true;
    world.owned = [{ title: "Rome" }, { title: "Tuscany" }];
    await open();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("journey-paywall")).toBeNull();
  });
});
