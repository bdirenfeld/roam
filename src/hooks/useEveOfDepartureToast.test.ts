// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { localDate } from "@/lib/isSameLocalDay";

// Eve of departure (7 Oct 2026, delight audit, mock d11): the hook end to end
// over a fake Supabase — day-before only, both messages, once, organiser only.
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast, dismiss: vi.fn() }) }));

const db = vi.hoisted(() => ({ uid: "owner", tables: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const builder = (table: string) => {
      const result = () => ({ data: db.tables[table] ?? null, error: null });
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "order"]) b[m] = () => b;
      b.maybeSingle = async () => {
        const v = db.tables[table];
        return { data: Array.isArray(v) ? v[0] ?? null : v ?? null, error: null };
      };
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
      return b;
    };
    return {
      auth: { getSession: async () => ({ data: { session: db.uid ? { user: { id: db.uid } } : null } }) },
      from: builder,
    };
  },
}));

import { useEveOfDepartureToast } from "./useEveOfDepartureToast";

const plus = (n: number) => localDate(new Date(Date.now() + n * 86400000));

function journey(start: string, checklist: Record<string, unknown>) {
  db.tables = {
    trips: { id: "t1", user_id: "owner", destination: "Lisbon, Portugal", start_date: start, end_date: plus(6), party_size: 2, party_ages: null, booking_checklist: checklist },
    days: [{ id: "d1", date: start }],
    cards: [],
    people: [],
    users: { home_airport: "YYZ", home_country: "Canada", passport_country: null },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  toast.mockClear();
  localStorage.clear();
  db.uid = "owner";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ airports: ["LIS"] }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("useEveOfDepartureToast", () => {
  it("the day before, everything booked or not needed: 'all booked ✓', no button", async () => {
    journey(plus(1), { flights: "booked", stays: "booked", car: "skip" });
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0].message).toBe("Lisbon tomorrow · all booked ✓");
    expect(toast.mock.calls[0][0].action).toBeUndefined();
    expect(toast.mock.calls[0][0].undo).toBeUndefined();
    // Waits behind a "joined" toast instead of replacing it (7 Oct 2026, re-audit).
    expect(toast.mock.calls[0][0].wait).toBe(true);
  });

  it("the day before, rows open: 'n still to book' with a Bookings button that opens the sheet", async () => {
    journey(plus(1), { flights: "booked" });
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    const opts = toast.mock.calls[0][0];
    expect(opts.message).toBe("Lisbon tomorrow · 2 still to book");
    expect(opts.action.label).toBe("Bookings");
    const heard = vi.fn();
    window.addEventListener("roam:open-bookings", heard);
    opts.action.onClick();
    window.removeEventListener("roam:open-bookings", heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("shows once per journey on the device", async () => {
    journey(plus(1), { flights: "booked", stays: "booked", car: "skip" });
    const first = renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    first.unmount();
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await settle();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("not on the start day, two days before, or after", async () => {
    for (const start of [plus(0), plus(2), plus(-3)]) {
      journey(start, { flights: "booked", stays: "booked", car: "skip" });
      renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", start, true));
    }
    await settle();
    expect(toast).not.toHaveBeenCalled();
  });

  it("organiser only: a guest (disabled) or a signed-in non-owner sees nothing", async () => {
    journey(plus(1), { flights: "booked", stays: "booked", car: "skip" });
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), false));
    await settle();
    db.uid = "someone-else";
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await settle();
    expect(toast).not.toHaveBeenCalled();
    // A refused read must not use up the one showing.
    expect(localStorage.getItem("roam_eve_shown_t1")).toBeNull();
  });

  it("storage that throws: never shows", async () => {
    journey(plus(1), { flights: "booked", stays: "booked", car: "skip" });
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    renderHook(() => useEveOfDepartureToast("t1", "Lisbon, Portugal", plus(1), true));
    await settle();
    spy.mockRestore();
    expect(toast).not.toHaveBeenCalled();
  });
});
