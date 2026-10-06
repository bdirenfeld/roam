"use client";

// ── To book, at the top of Bookings (6 Oct 2026, mock approved) ────────────
// Three rows — Flights, Stays, Car. A booked row shows a ✓ and a struck title.
// An open row has a checkbox, ticked, meaning "include in my search"; the one
// button under the rows opens every ticked row (lib/booking/search): Flights
// and Car on Kayak in new tabs, then Stays in Roam's own Where to stay. A tab
// the browser blocked (an iPhone may allow only the first) stays as a
// "Next: Car ↗" button. Tapping one open row opens just that one. Booked /
// Not needed / Clear live behind the ⋯ at the row's end; a hand-marked Booked
// asks what it cost, and the budget counts that (lib/budget/booked).
// The owner's choices live in trips.booking_checklist.
// Owner only: a guest opening Bookings sees the uploads and nothing else, and
// the shared link never shows Bookings at all.
//
// Reads its own rows, so every host of DocumentsSheet gets it with no new
// plumbing. Arrival airports are asked for lazily, only when this renders for
// the owner with Flights or Car open and no codes on the journey's own flights.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import { currencyForDestination, HOME_CURRENCY } from "@/lib/budget/currency";
import {
  checklistRows, costLabel, needsAirports, readChecklist, readCosts, storeChecklist, withChoice,
  type CheckCard, type CheckInput, type Choice, type Cost, type RowKey,
} from "@/lib/booking/checklist";
import { runSteps, searchLabel, searchSteps, whereToStayHref, type Step } from "@/lib/booking/search";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const RULE = "rgba(26,26,46,0.10)";

/** One answer per journey per page load: the server caches for good anyway. */
const airportsAsked = new Map<string, string[]>();

type Loaded = Omit<CheckInput, "airports" | "trip"> & {
  trip: CheckInput["trip"] & { id: string; cruise?: boolean | null };
  /** What a typed cost defaults to: the budget's currency. */
  currency: string;
};

/** A booked row's ✓, a Not needed row's dash. Not a control. */
function Mark({ state }: { state: "booked" | "skip" }) {
  if (state === "booked") {
    return (
      <span aria-hidden="true" className="w-[22px] h-[22px] rounded-[6px] grid place-items-center flex-shrink-0" style={{ background: INK, border: `2px solid ${INK}` }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17 19 7" /></svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="w-[22px] h-[22px] rounded-[6px] grid place-items-center flex-shrink-0" style={{ border: `2px dashed ${CAPTION}` }}>
      <span className="block w-[10px] h-[2px]" style={{ background: CAPTION }} />
    </span>
  );
}

/** "Include in my search": an outlined box with an ink tick, so it never reads as Booked. */
function Tick({ on }: { on: boolean }) {
  return (
    <span className="w-[22px] h-[22px] rounded-[6px] grid place-items-center" style={{ border: `2px solid ${on ? INK : CAPTION}`, background: "#FFFFFF" }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17 19 7" /></svg>}
    </span>
  );
}

/** Opens a Kayak tab. No "noopener" feature: with it window.open returns null
 *  even when the tab opened, and a blocked popup could not be told apart. */
function openTab(url: string): Window | null {
  const w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch { /* cross-origin already */ } }
  return w;
}

export default function ToBookSection({ tripId, onLeave }: { tripId: string; onLeave?: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [airports, setAirports] = useState<string[] | null>(airportsAsked.get(tripId) ?? null);
  const [menu, setMenu] = useState<RowKey | null>(null);
  // Open rows are in the search unless unticked (this visit only).
  const [unticked, setUnticked] = useState<Set<RowKey>>(new Set());
  // Tabs a browser blocked, one "Next" tap each.
  const [queue, setQueue] = useState<Step[]>([]);
  const [costFor, setCostFor] = useState<RowKey | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: session }, trip, days, cards, people, budget] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("trips").select("id, user_id, destination, start_date, end_date, party_size, party_ages, booking_checklist, cruise").eq("id", tripId).maybeSingle(),
        supabase.from("days").select("id, date").eq("trip_id", tripId),
        supabase.from("cards").select("id, day_id, place_id, status, start_time, end_time, details, place:places(sub_type, title, address)").eq("trip_id", tripId).not("day_id", "is", null),
        supabase.from("people").select("birthdate").eq("trip_id", tripId),
        supabase.from("trip_budgets").select("currency").eq("trip_id", tripId).maybeSingle(),
      ]);
      const uid = session?.session?.user?.id ?? null;
      const t = trip.data as (Loaded["trip"] & { user_id: string }) | null;
      // Owner only: guests (and cohosts) never see the checklist.
      if (cancelled || !t || !uid || t.user_id !== uid) return;
      const { data: me } = await supabase.from("users").select("home_airport, home_country").eq("id", uid).maybeSingle();
      if (cancelled) return;
      const budgetCurrency = (budget?.data as { currency?: string | null } | null)?.currency ?? null;
      setData({
        trip: t,
        home: { airport: (me?.home_airport as string | null) ?? null, country: (me?.home_country as string | null) ?? null },
        days: (days.data ?? []) as { id: string; date: string }[],
        cards: (cards.data ?? []) as unknown as CheckCard[],
        birthdates: ((people.data ?? []) as { birthdate: string | null }[]).map((p) => p.birthdate),
        currency: budgetCurrency ?? currencyForDestination(t.destination) ?? HOME_CURRENCY,
      });
    })().catch((e) => console.error("[to book]", e));
    return () => { cancelled = true; };
  }, [tripId]);

  // Arrival airports, lazily and at most once per journey per page load.
  useEffect(() => {
    if (!data || airports != null || !needsAirports({ ...data, airports: null })) return;
    let cancelled = false;
    fetch("/api/booking/airports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId }) })
      .then((r) => (r.ok ? r.json() : { airports: [] }))
      .then((j: { airports?: unknown }) => {
        const codes = Array.isArray(j.airports) ? j.airports.filter((c): c is string => typeof c === "string") : [];
        airportsAsked.set(tripId, codes);
        if (!cancelled) setAirports(codes);
      })
      .catch(() => { if (!cancelled) setAirports([]); });
    return () => { cancelled = true; };
  }, [data, airports, tripId]);

  const save = useCallback(async (next: Record<string, unknown>) => {
    if (!data) return false;
    setData((d) => (d ? { ...d, trip: { ...d.trip, booking_checklist: next } } : d));
    const { error } = await queuedUpdate("trips", { id: data.trip.id }, { booking_checklist: next });
    return !error;
  }, [data]);

  /** One write with a toast and Undo; a refusal puts the old checklist back. */
  const write = useCallback(async (next: Record<string, unknown>, message: string) => {
    if (!data) return false;
    const raw = data.trip.booking_checklist ?? {};
    const before = storeChecklist(readChecklist(raw), readCosts(raw));
    if (!(await save(next))) {
      setData((d) => (d ? { ...d, trip: { ...d.trip, booking_checklist: before } } : d));
      toast({ message: "Couldn't save that. Try again." });
      return false;
    }
    toast({ message, undo: async () => { if (!(await save(before))) toast({ message: "Couldn't undo that. Try again." }); } });
    return true;
  }, [data, save, toast]);

  const choose = useCallback(async (key: RowKey, choice: Choice | null, title: string) => {
    setMenu(null);
    if (!data) return;
    const raw = data.trip.booking_checklist ?? {};
    const ok = await write(
      storeChecklist(withChoice(readChecklist(raw), key, choice), readCosts(raw)),
      choice === "booked" ? `${title}: booked` : choice === "skip" ? `${title}: not needed` : `${title}: cleared`,
    );
    // Booked by hand: what did it cost? Optional — the budget counts it if given.
    if (ok && choice === "booked") { setCostFor(key); setAmount(""); setCurrency(data.currency); }
    else setCostFor(null);
  }, [data, write]);

  const saveCost = useCallback(async (key: RowKey, title: string) => {
    if (!data) return;
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) { setCostFor(null); return; }
    const raw = data.trip.booking_checklist ?? {};
    const cost: Cost = { amount: Math.round(n * 100) / 100, currency: currency || data.currency };
    setCostFor(null);
    await write(storeChecklist(readChecklist(raw), { ...readCosts(raw), [key]: cost }), `${title}: ${costLabel(cost)}`);
  }, [data, amount, currency, write]);

  const goStays = useCallback(() => {
    const desktop = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches === true;
    onLeave?.();
    router.push(whereToStayHref(tripId, desktop));
  }, [onLeave, router, tripId]);

  const run = useCallback((steps: Step[]) => {
    const r = runSteps(steps, openTab);
    setQueue(r.rest);
    if (r.stay) goStays();
  }, [goStays]);

  if (!data) return null;
  const rows = checklistRows({ ...data, airports });
  const stayInApp = data.trip.cruise !== true;
  const steps = searchSteps(rows, (k) => !unticked.has(k), stayInApp);
  const anyOpen = rows.some((r) => r.state === "open");
  const currencies = Array.from(new Set([data.currency, HOME_CURRENCY, "USD", "EUR", "GBP"]));

  return (
    <div className="px-5 pt-3" data-testid="to-book">
      <p className="text-[10.5px] uppercase tracking-[0.1em] pb-1" style={{ color: CAPTION }}>To book</p>
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden="true" />}
      {rows.map((r) => {
        const inApp = r.key === "stays" && stayInApp && r.state === "open";
        const body = (
          <>
            <span className="flex-1 min-w-0 text-left">
              <span className={`block text-[14px] font-semibold ${r.state === "booked" ? "line-through" : ""}`} style={{ color: r.state === "open" ? INK : CAPTION }}>{r.title}</span>
              <span className="block text-[12px] mt-0.5 truncate" style={{ color: CAPTION }}>{r.line}</span>
            </span>
            {r.state === "open" && <span aria-hidden="true" className="ml-2 text-[16px] flex-shrink-0" style={{ color: CAPTION }}>{inApp ? "›" : "↗"}</span>}
          </>
        );
        const on = !unticked.has(r.key);
        return (
          <div key={r.key} style={{ borderTop: `1px solid ${RULE}` }}>
            <div className="relative flex items-center" data-testid={`to-book-${r.key}`} data-state={r.state}>
              {r.state === "open" ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Include ${r.title} in the search`}
                  onClick={() => setUnticked((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
                  className="-ml-[11px] p-[11px] flex-shrink-0"
                >
                  <Tick on={on} />
                </button>
              ) : (
                <span className="py-[11px] pr-[11px] flex-shrink-0"><Mark state={r.state} /></span>
              )}
              {inApp ? (
                <button type="button" onClick={goStays} aria-label={`Stays: ${r.line}. Opens Where to stay`} className="flex-1 min-w-0 flex items-center py-3 pl-1">{body}</button>
              ) : r.state === "open" && r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center py-3 pl-1">{body}</a>
              ) : (
                <div className="flex-1 min-w-0 flex items-center py-3 pl-1">{body}</div>
              )}
              <button
                type="button"
                onClick={() => setMenu(menu === r.key ? null : r.key)}
                aria-label={`${r.title} options`}
                aria-haspopup="menu"
                aria-expanded={menu === r.key}
                className="-mr-[10px] w-[44px] h-[44px] grid place-items-center flex-shrink-0 text-[18px] leading-none"
                style={{ color: CAPTION }}
              >
                ⋯
              </button>
              {menu === r.key && (
                <div role="menu" className="absolute right-0 top-[44px] z-20 bg-white rounded-xl overflow-hidden grid text-[13px] min-w-[170px]"
                  style={{ border: `1px solid ${RULE}`, boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
                  <button type="button" role="menuitem" onClick={() => choose(r.key, "booked", r.title)} className="text-left px-4 py-[10px] font-semibold" style={{ color: INK }}>Booked</button>
                  <button type="button" role="menuitem" onClick={() => choose(r.key, "skip", r.title)} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Not needed</button>
                  {r.manual === "booked" && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); setCostFor(r.key); setAmount(r.cost ? String(r.cost.amount) : ""); setCurrency(r.cost?.currency ?? data.currency); }} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>What did it cost?</button>
                  )}
                  {/* Booked stays still reach Where to stay: the journey menu's
                      Stay tile is gone, so this is its door once the row ticks. */}
                  {r.key === "stays" && r.state !== "open" && stayInApp && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); goStays(); }} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Where to stay</button>
                  )}
                  {r.manual && (
                    <button type="button" role="menuitem" onClick={() => choose(r.key, null, r.title)} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Clear</button>
                  )}
                </div>
              )}
            </div>
            {costFor === r.key && (
              <form
                data-testid="to-book-cost"
                className="pb-3"
                onSubmit={(e) => { e.preventDefault(); void saveCost(r.key, r.title); }}
              >
                <label htmlFor={`cost-${r.key}`} className="block text-[12px] pb-1.5" style={{ color: CAPTION }}>What did it cost?</label>
                <div className="flex items-center gap-2">
                  <input
                    id={`cost-${r.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-[96px] rounded-full px-3 py-1.5 text-[13px] text-right"
                    style={{ boxShadow: `inset 0 0 0 1px ${RULE}`, color: INK }}
                  />
                  <select
                    aria-label="Currency"
                    value={currency || data.currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="rounded-full px-2 py-1.5 text-[13px] bg-white"
                    style={{ boxShadow: `inset 0 0 0 1px ${RULE}`, color: INK }}
                  >
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="submit" className="px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: INK, color: "#F5F4F1" }}>Save</button>
                  <button type="button" onClick={() => setCostFor(null)} className="px-2 py-1.5 text-[13px]" style={{ color: CAPTION }}>Not now</button>
                </div>
              </form>
            )}
          </div>
        );
      })}
      {queue.length > 0 ? (
        <button
          type="button"
          onClick={() => run(queue)}
          className="w-full mt-2 py-3 rounded-xl text-[14px] font-semibold"
          style={{ background: "#FFFFFF", color: INK, boxShadow: `inset 0 0 0 1.5px ${INK}` }}
        >
          Next: {queue[0].title}{queue[0].url ? " ↗" : ""}
        </button>
      ) : anyOpen && (
        <button
          type="button"
          onClick={() => run(steps)}
          disabled={!steps.length}
          className="w-full mt-2 py-3 rounded-xl text-[14px] font-semibold disabled:opacity-40"
          style={{ background: INK, color: "#F5F4F1" }}
        >
          {searchLabel(steps)}
        </button>
      )}
    </div>
  );
}
