"use client";

// ── Bookings, the owner's view (6 Oct 2026 redesign, mock approved) ─────────
// One job: get Flights, Stays and Car booked. Three rows, each ONE mark on the
// left — ○ still to book, filled green ✓ booked (by itself or by hand), dashed
// – not needed — a title, one short line and a faint ›.
//   - The whole row is the tap (lib/booking/files rowTap): still to book opens
//     its Kayak search (Stays: Roam's Where to stay); booked opens its
//     confirmation file, else the day its card is on (Stays too: Where to
//     stay read as "book another hotel", 6 Oct 2026).
//   - The MARK opens the small menu: Booked / Not needed / Clear, "What did it
//     cost?" after a hand Booked (the budget counts it, lib/budget/booked).
//   - One primary button, "Book N on Kayak": every row still to book, Kayak
//     tabs first, then Where to stay (lib/booking/search). A tab the browser
//     blocked (an iPhone may allow only the first) waits as "Next: Car ↗".
//   - Back from Kayak: each row that opened a Kayak tab and is still ○ asks
//     "Did you book it?" in place of its line — Booked (the menu's Booked,
//     then "What did it cost?") or Not yet (7 Oct 2026, delight audit, mock
//     approved; lib/booking/didYouBook). Where to stay is in-app: never asks.
//   - "Upload a confirmation" is a quiet link under it; uploaded files sit in
//     their row, and anything matching no row is "Other files (n)".
// The owner's choices live in trips.booking_checklist.
// Owner only: anyone else gets DocumentsSheet's plain file list (onOwner tells
// it which), and the shared link never shows Bookings at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import { currencyForDestination, homeCurrencyFor } from "@/lib/budget/currency";
import {
  checklistRows, costCurrencies, costLabel, needsAirports, readChecklist, readCosts, storeChecklist, withChoice,
  type CheckCard, type CheckInput, type CheckRow, type Choice, type Cost, type RowKey,
} from "@/lib/booking/checklist";
import { bookLabel, runSteps, searchSteps, whereToStayHref, type Step } from "@/lib/booking/search";
import { filesFor, openable, otherFiles, rowLine, rowTap, type BookingFile } from "@/lib/booking/files";
import { asking, readOpened, sessionStore, withOpened, withoutOpened, writeOpened } from "@/lib/booking/didYouBook";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const FAINT = "rgba(26,26,46,0.40)";
const RULE = "rgba(26,26,46,0.10)";
/** The app's done green (FindSheet's Saved, StartHere's ticks). */
const GREEN = "#1D7A55";

/** One answer per journey per page load: the server caches for good anyway. */
const airportsAsked = new Map<string, string[]>();

type Loaded = Omit<CheckInput, "airports" | "trip"> & {
  trip: CheckInput["trip"] & { id: string; cruise?: boolean | null };
  /** What a typed cost defaults to: the person's home currency (6 Oct 2026). */
  currency: string;
  /** The journey's own currency, the next choice; null when unknown. */
  local: string | null;
};

const STATE_WORDS: Record<CheckRow["state"], string> = { open: "still to book", booked: "booked", skip: "not needed" };

/** The row's one status mark: ○ to book, green ✓ booked, dashed – not needed. */
function Mark({ state }: { state: CheckRow["state"] }) {
  if (state === "booked") {
    return (
      <span aria-hidden="true" className="w-6 h-6 rounded-full grid place-items-center" style={{ background: GREEN }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17 19 7" /></svg>
      </span>
    );
  }
  if (state === "skip") {
    return (
      <span aria-hidden="true" className="w-6 h-6 rounded-full grid place-items-center" style={{ border: `2px dashed ${FAINT}` }}>
        <span className="block w-[9px] h-[2px]" style={{ background: FAINT }} />
      </span>
    );
  }
  return <span aria-hidden="true" className="block w-6 h-6 rounded-full" style={{ border: `2px solid ${INK}` }} />;
}

/** Opens a Kayak tab. No "noopener" feature: with it window.open returns null
 *  even when the tab opened, and a blocked popup could not be told apart. */
function openTab(url: string): Window | null {
  const w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch { /* cross-origin already */ } }
  return w;
}

interface Props {
  tripId: string;
  /** Closes Bookings before going to another screen (Where to stay, a day). */
  onLeave?: () => void;
  /** Every upload, each already placed in its row or in Other files. */
  files?: BookingFile[];
  /** Opens a file in the viewer (DocumentsSheet owns it). */
  onOpenFile?: (f: BookingFile) => void;
  /** The upload; absent on a read-only host. */
  onImport?: () => void;
  /** Takes an upload record off the list (the file and its cards stay). */
  onRemoveDocument?: (id: string) => void;
  /** Tells the host whether this is the owner, once known. */
  onOwner?: (owner: boolean) => void;
}

export default function ToBookSection({ tripId, onLeave, files = [], onOpenFile, onImport, onRemoveDocument, onOwner }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [airports, setAirports] = useState<string[] | null>(airportsAsked.get(tripId) ?? null);
  const [menu, setMenu] = useState<RowKey | null>(null);
  // A row with several files unfolds them under it.
  const [unfolded, setUnfolded] = useState<RowKey | null>(null);
  const [showOther, setShowOther] = useState(false);
  // Tabs a browser blocked, one "Next" tap each.
  const [queue, setQueue] = useState<Step[]>([]);
  const [costFor, setCostFor] = useState<RowKey | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  // "Did you book it?" (7 Oct 2026, delight audit): rows that opened a Kayak
  // tab (kept in sessionStorage, so a reload keeps them), and the ones asking
  // now that the person is back on Roam's tab.
  const opened = useRef<RowKey[]>([]);
  const [asked, setAsked] = useState<RowKey[]>([]);

  useEffect(() => {
    // A reload of Roam's tab means they are back: the remembered rows ask.
    opened.current = readOpened(sessionStore(), tripId);
    setAsked(opened.current);
    const back = () => { if (document.visibilityState !== "hidden") setAsked(opened.current); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [tripId]);

  /** Rows whose Kayak tab just opened: they ask once the person is back. */
  const remember = useCallback((keys: RowKey[]) => {
    if (!keys.length) return;
    opened.current = withOpened(opened.current, keys);
    writeOpened(sessionStore(), tripId, opened.current);
    setAsked((a) => a.filter((k) => !keys.includes(k)));
  }, [tripId]);

  /** Answered (or chosen from the menu): the row stops asking. */
  const forget = useCallback((key: RowKey) => {
    opened.current = withoutOpened(opened.current, key);
    writeOpened(sessionStore(), tripId, opened.current);
    setAsked((a) => withoutOpened(a, key));
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: session }, trip, days, cards, people] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("trips").select("id, user_id, destination, start_date, end_date, party_size, party_ages, booking_checklist, cruise").eq("id", tripId).maybeSingle(),
        supabase.from("days").select("id, date").eq("trip_id", tripId),
        supabase.from("cards").select("id, day_id, place_id, status, start_time, end_time, details, place:places(sub_type, title, address)").eq("trip_id", tripId).not("day_id", "is", null),
        supabase.from("people").select("birthdate").eq("trip_id", tripId),
      ]);
      const uid = session?.session?.user?.id ?? null;
      const t = trip.data as (Loaded["trip"] & { user_id: string }) | null;
      if (cancelled) return;
      // Owner only: guests (and cohosts) never see the checklist.
      if (!t || !uid || t.user_id !== uid) { onOwner?.(false); return; }
      const { data: me } = await supabase.from("users").select("home_airport, home_country, passport_country").eq("id", uid).maybeSingle();
      if (cancelled) return;
      const homeCountry = (me?.home_country as string | null) ?? null;
      const passport = (me?.passport_country as string | null) ?? null;
      setData({
        trip: t,
        home: { airport: (me?.home_airport as string | null) ?? null, country: homeCountry, passport },
        days: (days.data ?? []) as { id: string; date: string }[],
        cards: (cards.data ?? []) as unknown as CheckCard[],
        birthdates: ((people.data ?? []) as { birthdate: string | null }[]).map((p) => p.birthdate),
        currency: homeCurrencyFor(homeCountry, passport),
        local: currencyForDestination(t.destination),
      });
      onOwner?.(true);
    })().catch((e) => { console.error("[to book]", e); if (!cancelled) onOwner?.(false); });
    return () => { cancelled = true; };
    // onOwner is the host's setter; the load runs once per journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    forget(key);
    if (!data) return;
    const raw = data.trip.booking_checklist ?? {};
    const ok = await write(
      storeChecklist(withChoice(readChecklist(raw), key, choice), readCosts(raw)),
      choice === "booked" ? `${title}: booked` : choice === "skip" ? `${title}: not needed` : choice === "open" ? `${title}: not booked yet` : `${title}: cleared`,
    );
    // Booked by hand: what did it cost? Optional — the budget counts it if given.
    if (ok && choice === "booked") { setCostFor(key); setAmount(""); setCurrency(data.currency); }
    else setCostFor(null);
  }, [data, write, forget]);

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
    const phone = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches !== true;
    const r = runSteps(steps, openTab, phone);
    remember(r.opened);
    setQueue(r.rest);
    if (r.stay) goStays();
  }, [goStays, remember]);

  if (!data) return null;
  const rows = checklistRows({ ...data, airports });
  const stayInApp = data.trip.cruise !== true;
  const steps = searchSteps(rows, stayInApp);
  const label = bookLabel(steps);
  const others = otherFiles(files);
  const currencies = costCurrencies(data.currency, data.local).options;
  const asks = asking(rows, asked);

  const tap = (r: CheckRow) => {
    const t = rowTap(r, files, stayInApp);
    if (t.kind === "stays") { goStays(); return; }
    if (t.kind === "file") { onOpenFile?.(t.file); return; }
    if (t.kind === "files") { setUnfolded((u) => (u === r.key ? null : r.key)); return; }
    if (t.kind === "day") { onLeave?.(); router.push(`/trips/${tripId}/days/${t.dayId}`); return; }
    setMenu(r.key);
  };

  const item = "text-left px-4 py-[11px]";
  return (
    <div className="px-5" data-testid="to-book">
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden="true" />}
      {rows.map((r) => {
        const mine = filesFor(r.key, files);
        const canOpen = openable(mine);
        const tapped = rowTap(r, files, stayInApp);
        const tapsTo = tapped.kind;
        const rowClass = "flex-1 min-w-0 flex items-center gap-2 py-[13px] pl-1.5 text-left active:opacity-70";
        const body = (
          <>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold" style={{ color: r.state === "skip" ? CAPTION : INK }}>{r.title}</span>
              <span className="block text-[12.5px] mt-0.5 leading-snug" style={{ color: CAPTION }}>{rowLine(r, files)}</span>
            </span>
            <span aria-hidden="true" className="text-[17px] flex-shrink-0" style={{ color: FAINT }}>›</span>
          </>
        );
        // Back from Kayak and still ○: the question sits where the line was.
        // Not a link any more, so its two buttons are not inside one.
        const question = asks.has(r.key) ? (
          <span className="flex-1 min-w-0 py-[13px] pl-1.5" data-testid={`to-book-${r.key}-ask`}>
            <span className="block text-[15px] font-semibold" style={{ color: INK }}>{r.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[12.5px] leading-snug" style={{ color: CAPTION }}>
              <span>Did you book it?</span>
              {/* 44px tall to the finger, same look (7 Oct 2026, re-audit): the
                  Toast's Undo technique; sideways only half the 8px gap, so
                  Booked and Not yet never reach each other. */}
              <button type="button" onClick={() => void choose(r.key, "booked", r.title)} className="relative px-2.5 py-[3px] rounded-full font-semibold" style={{ color: GREEN, boxShadow: `inset 0 0 0 1.5px ${GREEN}` }}>
                <span aria-hidden="true" data-testid="ask-booked-target" className="absolute -inset-y-[11px] -inset-x-1" />
                Booked
              </button>
              <button type="button" onClick={() => forget(r.key)} className="relative px-1.5 py-[3px]" style={{ color: CAPTION }}>
                <span aria-hidden="true" data-testid="ask-not-yet-target" className="absolute -inset-y-[11px] -inset-x-1" />
                Not yet
              </button>
            </span>
          </span>
        ) : null;
        const docs = mine.filter((f) => f.source === "document");
        return (
          <div key={r.key} style={{ borderTop: `1px solid ${RULE}` }}>
            <div className="relative flex items-center" data-testid={`to-book-${r.key}`} data-state={r.state}>
              <button
                type="button"
                onClick={() => setMenu(menu === r.key ? null : r.key)}
                aria-label={`${r.title}: ${STATE_WORDS[r.state]}. Change`}
                aria-haspopup="menu"
                aria-expanded={menu === r.key}
                className="-ml-[10px] w-11 h-11 grid place-items-center flex-shrink-0"
              >
                <Mark state={r.state} />
              </button>
              {/* A Kayak search is a real link (an iPhone always lets a link
                  open a tab); everything else is a button. */}
              {question ?? (tapped.kind === "kayak" ? (
                <a href={tapped.url} target="_blank" rel="noopener noreferrer" onClick={() => remember([r.key])} data-testid={`to-book-${r.key}-row`} className={rowClass}>{body}</a>
              ) : (
                <button type="button" onClick={() => tap(r)} data-testid={`to-book-${r.key}-row`} className={rowClass}>{body}</button>
              ))}
              {menu === r.key && (
                <div role="menu" className="absolute left-0 top-[46px] z-20 bg-white rounded-xl overflow-hidden grid text-[13px] min-w-[180px]"
                  style={{ border: `1px solid ${RULE}`, boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
                  <button type="button" role="menuitem" onClick={() => choose(r.key, "booked", r.title)} className={`${item} font-semibold`} style={{ color: INK }}>Booked</button>
                  <button type="button" role="menuitem" onClick={() => choose(r.key, "skip", r.title)} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Not needed</button>
                  {/* An automatic tick (a stay already on the days) can be set back to ○ (6 Oct 2026: "it doesn't let me clear my stays"). */}
                  {!r.manual && r.state !== "open" && (
                    <button type="button" role="menuitem" onClick={() => choose(r.key, "open", r.title)} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Not booked yet</button>
                  )}
                  {r.manual === "booked" && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); setCostFor(r.key); setAmount(r.cost ? String(r.cost.amount) : ""); setCurrency(r.cost?.currency ?? data.currency); }} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>What did it cost?</button>
                  )}
                  {/* The row's tap goes elsewhere: these keep their door. */}
                  {canOpen.length > 0 && tapsTo !== "file" && tapsTo !== "files" && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); if (canOpen.length === 1) onOpenFile?.(canOpen[0]); else setUnfolded(r.key); }} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Open the confirmation</button>
                  )}
                  {r.key === "stays" && stayInApp && tapsTo !== "stays" && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); goStays(); }} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Where to stay</button>
                  )}
                  {onRemoveDocument && docs.map((d) => (
                    <button key={d.id} type="button" role="menuitem" onClick={() => { setMenu(null); onRemoveDocument(d.id); }} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>
                      Remove {docs.length > 1 ? d.fileName : "the upload"}
                    </button>
                  ))}
                  {r.manual && (
                    <button type="button" role="menuitem" onClick={() => choose(r.key, null, r.title)} className={item} style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Clear</button>
                  )}
                </div>
              )}
            </div>
            {unfolded === r.key && canOpen.length > 0 && (
              <div className="pl-[38px] pb-2 grid" data-testid={`to-book-${r.key}-files`}>
                {canOpen.map((f) => (
                  <button key={f.id} type="button" onClick={() => onOpenFile?.(f)} className="text-left text-[13px] py-2 underline underline-offset-[3px] truncate" style={{ color: INK }}>
                    {f.fileName}
                  </button>
                ))}
              </div>
            )}
            {costFor === r.key && (
              <form
                data-testid="to-book-cost"
                className="pb-3 pl-[38px]"
                onSubmit={(e) => { e.preventDefault(); void saveCost(r.key, r.title); }}
              >
                <label htmlFor={`cost-${r.key}`} className="block text-[12px] pb-1.5" style={{ color: CAPTION }}>What did it cost?</label>
                {/* Wraps at a narrow width rather than running off the sheet
                    (7 Oct 2026, re-audit): Save and Not now drop to a second line. */}
                <div data-testid="to-book-cost-row" className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <input
                    id={`cost-${r.key}`}
                    // The cursor is already in the box (7 Oct 2026, taps audit).
                    autoFocus
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
                  {/* 44px tall to the finger (7 Oct 2026, phone harness); sideways only half
                      the row's 8px gap, so Save never takes the currency's tap or Not now's. */}
                  <button type="submit" className="relative px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: INK, color: "#F5F4F1" }}><span aria-hidden="true" data-testid="cost-save-target" className="absolute -inset-y-1.5 -inset-x-1" />Save</button>
                  <button type="button" onClick={() => setCostFor(null)} className="relative px-2 py-1.5 text-[13px]" style={{ color: CAPTION }}><span aria-hidden="true" data-testid="cost-later-target" className="absolute -inset-y-1.5 -inset-x-1" />Not now</button>
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
          className="w-full mt-3 py-3 rounded-xl text-[14px] font-semibold"
          style={{ background: INK, color: "#F5F4F1" }}
          data-testid="to-book-next"
        >
          {queue[0].url ? `Next: book ${queue[0].title.toLowerCase()} on Kayak` : "Next: Where to stay"}
        </button>
      ) : label ? (
        <button
          type="button"
          onClick={() => run(steps)}
          className="w-full mt-3 py-3 rounded-xl text-[14px] font-semibold"
          style={{ background: INK, color: "#F5F4F1" }}
        >
          {label}
        </button>
      ) : rows.length > 0 && rows.every((r) => r.state !== "open") ? (
        // Nothing left to book: the button's spot says the job is done, in the
        // done green, and nothing else (7 Oct 2026, delight audit, mock approved).
        <p data-testid="all-booked" className="mt-3 py-3 text-center text-[14px] font-semibold" style={{ color: GREEN }}>
          ✓ Everything’s booked.
        </p>
      ) : null}
      {onImport && (
        <div className="text-center pt-3">
          <button type="button" onClick={onImport} className="relative text-[13px] underline underline-offset-[3px] py-1.5" style={{ color: CAPTION }}>
            {/* 6px up into the 12px under Book on Kayak (half of it), 6px down. */}
            <span aria-hidden="true" data-testid="upload-target" className="absolute -inset-y-1.5 inset-x-0" />
            Upload a confirmation
          </button>
        </div>
      )}
      {others.length > 0 && (
        <div className="text-center pt-1">
          <button type="button" onClick={() => setShowOther((s) => !s)} aria-expanded={showOther} className="text-[12.5px] py-1.5" style={{ color: CAPTION }}>
            Other files ({others.length})
          </button>
          {showOther && (
            <div className="grid text-left pt-1" data-testid="to-book-other">
              {others.map((f) => (
                <div key={f.id} className="flex items-center gap-2" style={{ borderTop: `1px solid ${RULE}` }}>
                  <button
                    type="button"
                    disabled={!f.url}
                    onClick={() => onOpenFile?.(f)}
                    className="flex-1 min-w-0 text-left py-2.5"
                  >
                    <span className="block text-[13px] font-medium truncate" style={{ color: INK }}>{f.fileName}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: CAPTION }}>{f.detail}</span>
                  </button>
                  {f.source === "document" && onRemoveDocument && (
                    <button type="button" onClick={() => onRemoveDocument(f.id)} aria-label={`Remove ${f.fileName}`} className="w-11 h-11 grid place-items-center flex-shrink-0 text-[15px]" style={{ color: FAINT }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
