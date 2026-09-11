"use client";

// ── Where to stay ─────────────────────────────────────────────────────────
// A half sheet over the Map. Above it, the candidates sit as lettered pins
// against the pins the person already chose; that is the recommendation,
// with no rings and no shading (Brennan, Sep 2026: "the map should be pretty
// simple"). The sheet is the list: the area in one line, a one-base-or-two
// line, then five rows. Tap a row and StayCardSheet opens — photos, who it
// fits, the dates and price, the drives, the reviews, what to ask.
//
// Nothing here asks a question. The search reads the journey. "Not for us"
// is two taps — the ✕, then a reason — and the reason is what the next run
// learns from. The handle drags: up for the full list, down to shrink, and
// a tap on the title bar toggles it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { scoreLabel } from "@/lib/stays/price";
import { noPriceReason, shiftToYear, type StayDates } from "@/lib/stays/bookingUrl";
import { parseAsk, askSummary, suggestions } from "@/lib/stays/wants";
import { parseBudget, budgetHint, budgetFieldValue } from "@/lib/stays/budgetInput";
import type { StayBrief } from "@/lib/stays/brief";
import type { StayCandidate, StayBriefRow, StayRejectReason, Trip } from "@/types/database";
import StayCardSheet from "./StayCardSheet";

const INK = "#1A1A2E";
const SIENNA = "#B0541F";
const CAPTION = "rgba(26,26,46,0.62)";

const REASONS: { key: StayRejectReason; label: string }[] = [
  { key: "too_far", label: "Too far" },
  { key: "too_dear", label: "Too expensive" },
  { key: "wrong_kind", label: "Wrong kind of place" },
  { key: "doesnt_fit", label: "Doesn't fit" },
];

interface Props {
  /** Desktop: a panel on the right of the map instead of a bottom sheet. */
  panel?: boolean;
  trip: Trip;
  /** Pins on the map with a place — the "From 47 places" line. */
  placesCount: number;
  focusedId: string | null;
  onFocus: (c: StayCandidate | null) => void;
  onCandidates: (cands: StayCandidate[]) => void;
  /** After Choose or Save the server data changed; the host refreshes. */
  onChanged: () => void;
  onClose: () => void;
}

function cad(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-CA");
}

export default function WhereToStaySheet({ panel = false, trip, placesCount, focusedId, onFocus, onCandidates, onChanged, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<StayBriefRow | null>(null);
  const [cands, setCands] = useState<StayCandidate[]>([]);
  /** Everything ever proposed for this journey, including set-aside and rejected. */
  const [everything, setEverything] = useState<StayCandidate[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  /** The must-haves and the budget, open only while being set. */
  const [showTerms, setShowTerms] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tall, setTall] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dragY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Escape closes the list (the card takes Escape while it is open); focus
  // lands in the sheet so keys work without a click.
  useEscapeKey(onClose, !openId);
  useEffect(() => { sheetRef.current?.focus(); }, []);

  const tripNights = Math.max(0, Math.round((new Date(trip.end_date + "T00:00:00").getTime() - new Date(trip.start_date + "T00:00:00").getTime()) / 86400000));
  const travellers = trip.party_size ?? trip.party_ages?.length ?? null;

  const publish = useCallback((rows: StayCandidate[]) => {
    setEverything(rows);
    setCands(rows.filter((c) => c.status !== "rejected" && c.status !== "seen"));
  }, []);

  /**
   * The search hands back only the live rows, but the ones it set aside are
   * still there and must stay reachable — pressing Run again by accident used
   * to lose five listings the moment the toast expired. So the new rows are
   * merged over the history, and anything the search no longer lists is marked
   * seen rather than dropped.
   */
  const mergeIn = useCallback((rows: StayCandidate[]) => {
    setEverything((prev) => {
      const fresh = new Map(rows.map((r) => [r.id, r]));
      const merged = prev.map((old) => fresh.get(old.id)
        ?? (old.status === "rejected" ? old : { ...old, status: "seen" as const }));
      const known = new Set(merged.map((r) => r.id));
      const all = [...merged, ...rows.filter((r) => !known.has(r.id))];
      setCands(all.filter((c) => c.status !== "rejected" && c.status !== "seen"));
      return all;
    });
  }, []);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [b, c, bud] = await Promise.all([
      supabase.from("stay_briefs").select("*").eq("trip_id", trip.id).maybeSingle(),
      supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).order("letter"),
      supabase.from("trip_budgets").select("assumptions").eq("trip_id", trip.id).maybeSingle(),
    ]);
    setBrief((b.data as StayBriefRow | null) ?? null);
    publish((c.data ?? []) as StayCandidate[]);
    const rate = (bud.data?.assumptions as { nightlyRate?: number } | null)?.nightlyRate ?? null;
    setBudget((cur) => (cur ? cur : budgetFieldValue(rate)));
  }, [trip.id, publish]);

  // What the last run left behind.
  useEffect(() => {
    let cancelled = false;
    reload().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  // A tapped pin scrolls its row into view and flashes it for a second, so
  // the eye can find "E" in the list without reading the letters.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cand="${focusedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlashId(focusedId);
    // With a card already open, tapping another pin should move the card to it —
    // flashing a row behind the card is invisible (Brennan, 10 Sept 2026).
    setOpenId((id) => (id ? focusedId : id));
    const t = setTimeout(() => setFlashId(null), 1100);
    return () => clearTimeout(t);
  }, [focusedId]);

  // The handle: drag up for the full list, down to shrink; a tap toggles.
  //
  // A touch fires BOTH onTouchEnd and, a moment later, a synthetic click. With
  // a toggle on each, every tap toggled twice and landed back where it started
  // — and a real drag down was undone by the click that followed it. So the
  // sheet could not be pulled down at all on a phone: "it's hard for me to do
  // that" (Brennan, 10 Sept 2026). The touch wins; the click stands down.
  const touchedAt = useRef(0);
  function onTouchStart(e: React.TouchEvent) { dragY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) {
    const from = dragY.current;
    dragY.current = null;
    if (from == null) return;
    const dy = e.changedTouches[0].clientY - from;
    touchedAt.current = Date.now();
    if (dy < -40) setTall(true);
    else if (dy > 40) setTall(false);
    else if (Math.abs(dy) < 12) setTall((t) => !t);
  }
  /** Mouse only. A synthetic click after a touch would undo what the drag just did. */
  function onHeaderClick() {
    if (Date.now() - touchedAt.current < 700) return;
    setTall((t) => !t);
  }

  // What he asked for last time, so Run again never makes him retype it.
  // Which base the sheet is on. A journey needing two places to sleep gets
  // five for each, switched at the top, so the map never carries ten pins
  // spread over 400 km (Brennan, 10 Sept 2026).
  const [baseIdx, setBaseIdx] = useState(0);
  const [wants, setWants] = useState("");
  // Seeded from the Estimate, and written back to it when it changes.
  const [budget, setBudget] = useState("");
  useEffect(() => {
    const w = (brief?.brief as { wants?: string | null } | undefined)?.wants;
    if (typeof w === "string") setWants(w);
  }, [brief]);

  const briefObjForAsk = (brief?.brief ?? null) as (StayBrief & { wants?: string | null; areaByBase?: Record<string, string | null> }) | null;
  const bases = briefObjForAsk?.bases ?? [];
  const multi = bases.length > 1;
  // Only this base's five, and only this base's line of copy.
  // MUST be memoised. A fresh array here is a new dependency every render, so
  // the effect below pushed a new list to the map on every render, the map set
  // state, and round it went — refitting the bounds every frame and fighting
  // any attempt to pinch or zoom. Only Japan showed it, because a single-base
  // journey passes `cands` straight through (Brennan, 10 Sept 2026).
  const shown = useMemo(
    () => (multi ? cands.filter((c) => (c.base ?? 0) === baseIdx) : cands),
    [multi, cands, baseIdx],
  );
  const areaText = multi
    ? (briefObjForAsk?.areaByBase?.[String(baseIdx)] ?? null)
    : (brief?.area_text ?? null);

  /**
   * The nights and dates THIS base is for. The search prices Tokyo's eight
   * nights, and the sheet was still labelling every row "for 13 nights" and
   * opening the booking link on the whole journey (audit, 10 Sept 2026).
   * Bases run in order from the start date, same as the server works it out.
   */
  const nights = multi ? (bases[baseIdx]?.nights ?? tripNights) : tripNights;
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const nightsBefore = multi ? bases.slice(0, baseIdx).reduce((n, b) => n + b.nights, 0) : 0;
  const baseStart = addDays(trip.start_date, nightsBefore);
  const baseEnd = addDays(baseStart, nights);
  // When the search rolled the year to find a price, the link rolls with it.
  const priced = shiftToYear(baseStart, baseEnd, brief?.price_year ?? null);
  const stayDates: StayDates = {
    checkIn: priced.start,
    checkOut: priced.end,
    adults: (trip.party_ages ?? []).filter((a) => a >= 13).length || trip.party_size || 2,
    childrenAges: (trip.party_ages ?? []).filter((a) => a < 13),
  };
  // If anything in this run priced, the dates are quotable — so a row with
  // no price is about that property, not the calendar.
  const othersPriced = shown.some((c) => c.total != null);

  // Five pins, never ten: the map shows the base the sheet is on.
  useEffect(() => { onCandidates(shown); }, [shown, onCandidates]);

  // A base searches the first time you open it, not all of them up front:
  // half the API calls, and the second base often goes unopened in a sitting.
  // The ref stops a base with genuinely nothing to find from looping.
  const tried = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (loading || running || !multi) return;
    if (shown.length || tried.current.has(baseIdx)) return;
    tried.current.add(baseIdx);
    void run();
    // run() is stable enough here: it reads the latest state through closure
    // on each render, and the guards above stop it firing twice for a base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIdx, loading, running, multi, shown.length]);
  const settled = (i: number) => cands.some((c) => (c.base ?? 0) === i && c.status === "chosen");
  // Everything this base has pushed aside or that he said no to. Nothing is
  // ever destroyed by Run again; it just stops being one of the five.
  const earlier = everything
    .filter((c) => (multi ? (c.base ?? 0) === baseIdx : true))
    .filter((c) => c.status === "seen" || c.status === "rejected");
  const said = askSummary(parseAsk(wants));

  // What the collapsed line says. Everything that has been set, in plain
  // words, so nothing is hidden — it just stops holding the floor.
  const budgetNightly = parseBudget(budget, nights).nightly;
  const termsLine = [
    said.must ? said.must.replace(/^Must have: /, "Must have ") : null,
    said.nice,
    budgetNightly ? `up to $${budgetNightly.toLocaleString("en-CA")} a night` : null,
  ].filter(Boolean).join(" · ") || "Anything that matters here?";
  const chips = suggestions({
    house: briefObjForAsk?.kind === "house",
    askGroundFloor: briefObjForAsk?.fit?.askGroundFloor,
    askCot: briefObjForAsk?.fit?.askCot,
  }).filter((c) => !new RegExp(c.split(" ")[0], "i").test(wants));

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/stays/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, wants: wants.trim() || undefined, budget: budget.trim() || undefined, base: baseIdx }) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "That didn't work."); return; }
      const hadRows = cands.length > 0;
      setBrief(json.brief as StayBriefRow);
      mergeIn(json.candidates as StayCandidate[]);
      if (hadRows && json.undo) {
        toast({
          message: "Five new places",
          undo: async () => {
            const r = await fetch("/api/stays/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: json.undo }) });
            const back = await r.json();
            if (!r.ok) { toast({ message: "Couldn't undo that." }); return; }
            mergeIn(back.candidates as StayCandidate[]);
          },
        });
      }
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setRunning(false);
    }
  }

  async function choose(c: StayCandidate) {
    setBusyId(c.id);
    try {
      const res = await fetch("/api/stays/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id }) });
      const json = await res.json();
      if (!res.ok) { toast({ message: json.error ?? "Couldn't choose it." }); return; }
      publish(everything.map((x) => x.id === c.id ? { ...x, status: "chosen", place_id: json.placeId } : x.status === "chosen" ? { ...x, status: "saved" } : x));
      setOpenId(null);
      onChanged();
      toast({
        message: `${c.name} is your stay`,
        undo: async () => {
          const r = await fetch("/api/stays/choose", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json.undo) });
          if (!r.ok) { toast({ message: "Couldn't undo that." }); return; }
          // The server decides what the row goes back to (candidate, or saved
          // when a card still points at the place), so read it back.
          await reload();
          onChanged();
        },
      });
    } finally {
      setBusyId(null);
    }
  }

  async function save(c: StayCandidate) {
    setBusyId(c.id);
    try {
      const res = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "save" }) });
      const json = await res.json();
      if (!res.ok) { toast({ message: json.error ?? "Couldn't save it." }); return; }
      publish(everything.map((x) => x.id === c.id && x.status !== "chosen" ? { ...x, status: "saved", place_id: json.placeId } : x));
      onChanged();
      toast({
        message: `${c.name} is on your map`,
        undo: async () => {
          const r = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "unsave", cardId: json.createdCard ? json.cardId : null, createdPlace: json.createdPlace }) });
          if (!r.ok) { toast({ message: "Couldn't undo that." }); return; }
          await reload();
          onChanged();
        },
      });
    } finally {
      setBusyId(null);
    }
  }

  /** Put one back on the list. Works for a set-aside row and a rejected one. */
  async function restore(c: StayCandidate) {
    setBusyId(c.id);
    try {
      const action = c.status === "rejected" ? "unreject" : "restore";
      const res = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ message: "Couldn't bring that back." }); return; }
      publish(everything.map((x) => x.id === c.id ? { ...x, status: (json.status as StayCandidate["status"]) ?? "candidate", letter: (json.letter as string | undefined) ?? x.letter, reject_reason: null } : x));
      toast({ message: `${c.name} is back on the list` });
    } finally {
      setBusyId(null);
    }
  }

  async function heart(c: StayCandidate) {
    const res = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "heart" }) });
    const json = await res.json();
    if (!res.ok) { toast({ message: "Couldn't do that." }); return; }
    publish(everything.map((x) => x.id === c.id ? { ...x, feel: json.feel } : x));
  }

  async function reject(c: StayCandidate, reason: StayRejectReason) {
    setAskingId(null);
    setBusyId(c.id);
    try {
      const res = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "reject", reason }) });
      if (!res.ok) { toast({ message: "Couldn't do that." }); return; }
      publish(everything.map((x) => x.id === c.id ? { ...x, status: "rejected" } : x));
      if (focusedId === c.id) onFocus(null);
      toast({
        message: `${c.name} won't come back`,
        undo: async () => {
          const r = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "unreject" }) });
          if (!r.ok) { toast({ message: "Couldn't undo that." }); return; }
          await reload();
        },
      });
    } finally {
      setBusyId(null);
    }
  }

  const briefObj = (brief?.brief ?? null) as StayBrief | null;
  const open = openId ? cands.find((c) => c.id === openId) ?? null : null;

  return (
    <>
      <div
        className={panel ? "absolute inset-y-0 right-0 z-[60] flex" : "fixed inset-x-0 bottom-0 z-[60] flex items-end pointer-events-none"}
        style={panel ? { width: 400 } : undefined}
        role="dialog"
        aria-label="Where to stay"
      >
        <div
          ref={sheetRef}
          tabIndex={-1}
          className={panel
            ? "relative w-full h-full bg-white border-l flex flex-col overflow-hidden outline-none"
            : "relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet flex flex-col pointer-events-auto outline-none"}
          style={panel ? { borderColor: "rgba(26,26,46,0.1)" } : { height: tall ? "88dvh" : "46dvh", transition: "height 220ms ease" }}
        >
          <div
            className="flex-shrink-0 cursor-grab select-none"
            style={{ touchAction: "none" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClick={onHeaderClick}
            role="button"
            aria-label={tall ? "Show more map" : "Show the full list"}
          >
            {/* A bigger grab target and a bigger pill: the old one was a 3px
                line inside a 28px strip. */}
            {!panel && (
              <div className="flex justify-center pt-3.5 pb-3">
                <span className="w-12 h-[4px] rounded-full bg-gray-300" />
              </div>
            )}
            <div className={`flex items-center justify-between px-5 pb-2.5 border-b border-gray-100 ${panel ? "pt-4" : ""}`}>
              <h2 className="font-display italic" style={{ fontSize: 23, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>Where to stay</h2>
              <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
              </button>
            </div>
          </div>

          {panel && open && (
            <StayCardSheet
              key={open.id}
              inPanel
              backLabel={`All ${shown.length === 5 ? "five" : shown.length}`}
              candidate={open}
              brief={briefObj}
              startDate={trip.start_date}
              endDate={trip.end_date}
              nights={nights}
              priceYear={brief?.price_year ?? null}
              othersPriced={othersPriced}
              dates={stayDates}
              busy={busyId === open.id}
              onChoose={() => choose(open)}
              onSave={() => save(open)}
              onClose={() => setOpenId(null)}
            />
          )}

          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pb-6">
            {loading ? (
              <p className="px-5 py-8 text-center text-[13px]" style={{ color: CAPTION }}>Loading…</p>
            ) : cands.length === 0 ? (
              <div className="px-7 pt-8 text-center">
                <p className="font-display italic" style={{ fontSize: 21, color: INK }}>Not decided yet.</p>
                <p className="text-[13px] leading-relaxed mt-2" style={{ color: CAPTION }}>
                  Five places that fit this journey, and what to ask before booking. About a minute.
                </p>
                <button
                  type="button"
                  onClick={run}
                  disabled={running}
                  className="mt-5 w-full h-12 rounded-full text-[15px] font-semibold text-white disabled:opacity-60"
                  style={{ background: INK }}
                >
                  {running ? "Looking…" : "Find places"}
                </button>
                <p className="text-[12.5px] mt-4" style={{ color: CAPTION }}>
                  From {placesCount} {placesCount === 1 ? "place" : "places"}{travellers ? `, ${travellers} travellers` : ""}, {nights} {nights === 1 ? "night" : "nights"}.
                </p>
                {error && <p className="text-[12.5px] mt-3" style={{ color: SIENNA }}>{error}</p>}
              </div>
            ) : (
              <>
                {/* Two places to sleep means two lists of five, switched here
                    rather than stacked — ten pins across 400 km is not a map,
                    and A-through-J is the thing he rejected the first time
                    (Brennan, 10 Sept 2026). A tick marks a base already
                    settled, so progress needs no extra copy. */}
                {multi && (
                  <div className="px-4 pt-3">
                    <div className="flex gap-1.5 p-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.045)" }} role="tablist" aria-label="Which base">
                      {bases.map((b, i) => (
                        <button
                          key={b.label + i}
                          type="button"
                          role="tab"
                          aria-selected={i === baseIdx}
                          onClick={() => { setBaseIdx(i); setOpenId(null); onFocus(null); }}
                          className="flex-1 py-[7px] px-1.5 rounded-full text-center leading-tight"
                          style={i === baseIdx
                            ? { background: "#fff", color: INK, boxShadow: "0 1px 3px rgba(26,26,46,0.16)" }
                            : { color: CAPTION }}
                        >
                          <span className="block text-[13px] font-semibold">
                            {b.label}{settled(i) && <span className="ml-1" style={{ color: SIENNA }}>✓</span>}
                          </span>
                          <span className="block text-[10.5px] opacity-80">{b.nights} {b.nights === 1 ? "night" : "nights"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(areaText || brief?.split_text) && (
                  <div className="px-4 pt-3 pb-1 text-[12.5px] leading-relaxed" style={{ color: "rgba(26,26,46,0.75)" }}>
                    {areaText}{areaText && brief?.split_text ? " " : ""}
                    {brief?.split_text && <span style={{ color: SIENNA }}>{brief.split_text}</span>}
                  </div>
                )}

                {/* Switching to a base that has not run yet left a white void
                    with a small "Looking…" at the foot of the sheet, which
                    reads as broken — he opened Osaka and reported seeing no
                    hotels while the search was in flight (10 Sept 2026). The
                    waiting goes where the rows will be. */}
                {shown.length === 0 && (running || loading) && (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[13px]" style={{ color: CAPTION }}>
                      Looking for places {multi && bases[baseIdx] ? `around ${bases[baseIdx].label}` : "to stay"}…
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: "rgba(26,26,46,0.42)" }}>
                      Prices and drive times take a few seconds.
                    </p>
                  </div>
                )}

                {shown.map((c) => {
                  const focused = focusedId === c.id;
                  const chosen = c.status === "chosen";
                  const busy = busyId === c.id;
                  const meta = [
                    c.drive?.line,
                    c.score != null ? scoreLabel(c.score, (c.score_scale === 10 ? 10 : 5), c.reviews) : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={c.id}
                      data-cand={c.id}
                      onClick={() => { onFocus(c); setOpenId(c.id); }}
                      className={`flex gap-2.5 px-4 py-3 border-b cursor-pointer active:bg-gray-50 ${flashId === c.id ? "stay-flash" : ""}`}
                      style={{ borderColor: "rgba(26,26,46,0.07)", background: focused ? "rgba(176,84,31,0.06)" : undefined }}
                    >
                      <div className="w-[62px] flex-shrink-0 pt-[3px]">
                        <span
                          className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-bold"
                          style={chosen || focused ? { background: SIENNA, color: "#fff", border: `2px solid ${SIENNA}` } : { color: SIENNA, border: `2px solid ${SIENNA}` }}
                        >
                          {c.letter ?? "·"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display italic line-clamp-2" style={{ fontSize: 17, lineHeight: 1.24, color: INK }}>
                          {c.name}{chosen ? <span className="ml-2 not-italic font-sans text-[10px] uppercase tracking-wide" style={{ color: SIENNA }}>Your stay</span> : c.status === "saved" ? <span className="ml-2 not-italic font-sans text-[10px] uppercase tracking-wide" style={{ color: CAPTION }}>On your map</span> : null}
                        </p>
                        {meta && <p className="text-[12.5px] mt-[3px] leading-snug" style={{ color: CAPTION }}>{meta}</p>}
                        {c.flags?.length > 0 && <p className="text-[11px] font-medium mt-[3px]" style={{ color: SIENNA }}>{c.flags.join(" · ")}</p>}
                        {c.total != null ? (
                          <p className="text-[12.5px] mt-[3px]" style={{ color: INK }}>{cad(Number(c.total))} for {nights} nights</p>
                        ) : (
                          <p className="text-[12.5px] mt-[3px]" style={{ color: CAPTION }}>{noPriceReason({ site: c.site, url: c.url, source: c.source, othersPriced, party: travellers })}</p>
                        )}

                        {askingId === c.id ? (
                          <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[12.5px] self-center mr-1" style={{ color: SIENNA }}>Not for us:</span>
                            {REASONS.map((r) => (
                              <button key={r.key} type="button" onClick={() => reject(c, r.key)} className="h-9 px-3 rounded-full text-[12.5px] font-medium" style={{ color: INK, border: "1px solid rgba(26,26,46,0.2)" }}>
                                {r.label}
                              </button>
                            ))}
                            <button type="button" onClick={() => setAskingId(null)} className="h-9 px-2 text-[12.5px]" style={{ color: CAPTION }}>Keep</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={busy || chosen}
                              onClick={() => choose(c)}
                              className="h-9 px-3.5 rounded-full text-[12.5px] font-medium text-white disabled:opacity-60"
                              style={{ background: INK }}
                            >
                              {chosen ? "Chosen" : busy ? "…" : "Choose"}
                            </button>
                            {c.status === "candidate" && (
                              <button type="button" disabled={busy} onClick={() => save(c)} className="h-9 px-3.5 rounded-full text-[12.5px] font-medium" style={{ color: INK, border: "1px solid rgba(26,26,46,0.2)" }}>
                                Save
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={c.feel === "up" ? "Un-heart" : "Heart"}
                              aria-pressed={c.feel === "up"}
                              onClick={() => heart(c)}
                              className="ml-auto h-9 w-9 inline-flex items-center justify-center"
                              style={{ color: c.feel === "up" ? SIENNA : CAPTION }}
                            >
                              <svg width="17" height="17" viewBox="0 0 24 24" fill={c.feel === "up" ? SIENNA : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>
                            </button>
                            {!chosen && (
                              <button type="button" aria-label="Not for us" onClick={() => setAskingId(c.id)} className="h-9 w-9 inline-flex items-center justify-center text-[14px]" style={{ color: CAPTION }}>
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {c.photos?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photos[0]} alt="" loading="lazy" className="w-[52px] h-[52px] rounded-lg object-cover flex-shrink-0" style={{ background: "rgba(26,26,46,0.06)" }} />
                      )}
                    </div>
                  );
                })}

                {/* Nothing Run again pushed aside is gone — it is here, with a
                    way back that does not time out. Rejected ones sit here too,
                    with the reason given, so "not for us" is never a locked
                    door (Brennan, 10 Sept 2026). */}
                {showEarlier && earlier.map((c) => {
                  const why = c.status === "rejected"
                    ? `Not for us${c.reject_reason ? ` · ${REASONS.find((r) => r.key === c.reject_reason)?.label ?? ""}` : ""}`
                    : "Replaced by a later run";
                  return (
                    <div key={c.id} className="flex gap-2.5 px-4 py-2.5 border-b" style={{ borderColor: "rgba(26,26,46,0.07)", background: "rgba(26,26,46,0.02)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-display italic line-clamp-1" style={{ fontSize: 15, lineHeight: 1.3, color: CAPTION }}>{c.name}</p>
                        <p className="text-[11.5px] mt-[2px]" style={{ color: CAPTION }}>
                          {why}{c.total != null ? ` · ${cad(Number(c.total))}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => restore(c)}
                        className="self-center h-8 px-3 rounded-full text-[12px] font-medium flex-shrink-0"
                        style={{ color: INK, border: "1px solid rgba(26,26,46,0.2)" }}
                      >
                        {busyId === c.id ? "…" : "Bring back"}
                      </button>
                    </div>
                  );
                })}

                <div className="px-4 pt-4">
                  {/* One line, not seven controls.
                      Measured on his phone: this footer was 227px of a 388px
                      sheet and one listing of six was visible. Everything set
                      here is set once, so it states itself in plain words and
                      steps aside; Change brings it back (10 Sept 2026). */}
                  {!showTerms && (
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="w-full flex items-start justify-between gap-3 text-left"
                    >
                      <span className="text-[12.5px] leading-snug" style={{ color: CAPTION }}>{termsLine}</span>
                      <span className="text-[12.5px] font-semibold flex-shrink-0" style={{ color: SIENNA }}>Change</span>
                    </button>
                  )}

                  {showTerms && (
                  <>
                  {/* Write it however you'd say it. What a listing can answer
                      becomes a must-have; "would be nice" downgrades it; the
                      rest steers the search, and the lines underneath say
                      which is which, because a box that quietly ignores half
                      of what you typed is the bad version of this
                      (Brennan, 10 Sept 2026). */}
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "rgba(26,26,46,0.45)" }}>
                    What matters here?
                  </p>
                  <input
                    type="text"
                    value={wants}
                    onChange={(e) => setWants(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !running) run(); }}
                    placeholder="We need a pool, shops nearby would be nice"
                    aria-label="What matters here"
                    className="w-full h-11 px-3 rounded-lg bg-white text-[13.5px]"
                    style={{ border: "1px solid rgba(26,26,46,0.18)", color: INK }}
                  />
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {chips.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setWants((w) => (w.trim() ? `${w.replace(/[,\s]+$/, "")}, ${c.toLowerCase()}` : c.toLowerCase()))}
                          className="h-8 px-3 rounded-full text-[12.5px]"
                          style={{ color: INK, border: "1px solid rgba(26,26,46,0.18)" }}
                        >
                          + {c}
                        </button>
                      ))}
                    </div>
                  )}
                  {(said.must || said.nice || said.loose) && (
                    <div className="mt-2 space-y-0.5">
                      {said.must && <p className="text-[12px] font-medium" style={{ color: SIENNA }}>{said.must}</p>}
                      {said.nice && <p className="text-[12px]" style={{ color: CAPTION }}>{said.nice}</p>}
                      {said.loose && <p className="text-[12px]" style={{ color: CAPTION }}>{said.loose}</p>}
                    </div>
                  )}
                  {/* The ceiling, on the search rather than buried in the
                      Estimate — and the same number, so editing it here edits
                      it there. One field: the whole-stay figure is a hint, not
                      a second box for the two to disagree in. */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <label htmlFor="stay-budget" className="text-[12.5px] flex-shrink-0" style={{ color: CAPTION }}>Up to</label>
                    <input
                      id="stay-budget"
                      type="text"
                      inputMode="decimal"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !running) run(); }}
                      placeholder="480"
                      className="w-[104px] h-10 px-2.5 rounded-lg bg-white text-[13.5px]"
                      style={{ border: "1px solid rgba(26,26,46,0.18)", color: INK }}
                    />
                    <span className="text-[12.5px]" style={{ color: CAPTION }}>a night</span>
                  </div>
                  {(() => {
                    const b = parseBudget(budget, nights);
                    const hint = budgetHint(b.nightly, nights);
                    if (!hint) return null;
                    return (
                      <p className="text-[12px] mt-1" style={{ color: CAPTION }}>
                        {hint}{b.fromTotal ? " · read as a total" : ""} · also on your Estimate
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setShowTerms(false)}
                    className="mt-2 text-[12.5px] font-semibold"
                    style={{ color: SIENNA }}
                  >
                    Done
                  </button>
                  </>
                  )}
                  {/* A real button. This was grey text beside other grey text
                      and nobody read it as a control (Brennan, 10 Sept 2026:
                      "no one really knows it's a button"). Outlined rather
                      than solid, so it does not compete with Choose. */}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={run}
                      disabled={running}
                      className="h-10 px-4 rounded-full text-[13px] font-semibold disabled:opacity-60"
                      style={{ color: INK, border: `1.5px solid ${INK}`, background: "transparent" }}
                    >
                      {running ? "Looking…" : "Search again"}
                    </button>
                    {/* Nothing Run again sets aside is ever destroyed. The old
                        way back was a toast that expired, so pressing the
                        button by accident lost five listings for good
                        (Brennan, 10 Sept 2026). This door does not time out. */}
                    {earlier.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowEarlier((v) => !v)}
                        className="text-[12.5px] font-medium"
                        style={{ color: showEarlier ? INK : CAPTION }}
                      >
                        {showEarlier ? "Hide earlier" : `${earlier.length} earlier`}
                      </button>
                    )}
                  </div>
                  {error && <p className="text-[12.5px] mt-2" style={{ color: SIENNA }}>{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {open && !panel && (
        <StayCardSheet
          key={open.id}
          candidate={open}
          brief={briefObj}
          startDate={trip.start_date}
          endDate={trip.end_date}
          nights={nights}
          priceYear={brief?.price_year ?? null}
          othersPriced={othersPriced}
          dates={stayDates}
          busy={busyId === open.id}
          onChoose={() => choose(open)}
          onSave={() => save(open)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
