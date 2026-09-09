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

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { scoreLabel } from "@/lib/stays/price";
import type { StayBrief } from "@/lib/stays/brief";
import type { StayCandidate, StayBriefRow, StayRejectReason, Trip } from "@/types/database";
import StayCardSheet from "./StayCardSheet";

const INK = "#1A1A2E";
const SIENNA = "#B0541F";
const CAPTION = "rgba(26,26,46,0.62)";

const REASONS: { key: StayRejectReason; label: string }[] = [
  { key: "too_far", label: "Too far" },
  { key: "too_dear", label: "Too dear" },
  { key: "not_our_look", label: "Not our look" },
  { key: "doesnt_fit", label: "Doesn't fit" },
];

interface Props {
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

export default function WhereToStaySheet({ trip, placesCount, focusedId, onFocus, onCandidates, onChanged, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<StayBriefRow | null>(null);
  const [cands, setCands] = useState<StayCandidate[]>([]);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tall, setTall] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dragY = useRef<number | null>(null);

  const nights = Math.max(0, Math.round((new Date(trip.end_date + "T00:00:00").getTime() - new Date(trip.start_date + "T00:00:00").getTime()) / 86400000));
  const travellers = trip.party_size ?? trip.party_ages?.length ?? null;

  const publish = useCallback((rows: StayCandidate[]) => {
    const live = rows.filter((c) => c.status !== "rejected");
    setCands(live);
    onCandidates(live);
  }, [onCandidates]);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [b, c] = await Promise.all([
      supabase.from("stay_briefs").select("*").eq("trip_id", trip.id).maybeSingle(),
      supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).order("letter"),
    ]);
    setBrief((b.data as StayBriefRow | null) ?? null);
    publish((c.data ?? []) as StayCandidate[]);
  }, [trip.id, publish]);

  // What the last run left behind.
  useEffect(() => {
    let cancelled = false;
    reload().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  // A tapped pin scrolls its row into view.
  useEffect(() => {
    if (!focusedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cand="${focusedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedId]);

  // The handle: drag up for the full list, down to shrink; a tap toggles.
  function onTouchStart(e: React.TouchEvent) { dragY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) {
    const from = dragY.current;
    dragY.current = null;
    if (from == null) return;
    const dy = e.changedTouches[0].clientY - from;
    if (dy < -40) setTall(true);
    else if (dy > 40) setTall(false);
    else if (Math.abs(dy) < 8) setTall((t) => !t);
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/stays/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id }) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "That didn't work."); return; }
      setBrief(json.brief as StayBriefRow);
      publish(json.candidates as StayCandidate[]);
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
      publish(cands.map((x) => x.id === c.id ? { ...x, status: "chosen", place_id: json.placeId } : x.status === "chosen" ? { ...x, status: "saved" } : x));
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
      publish(cands.map((x) => x.id === c.id && x.status !== "chosen" ? { ...x, status: "saved", place_id: json.placeId } : x));
      onChanged();
      toast({ message: "Saved to your map" });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(c: StayCandidate, reason: StayRejectReason) {
    setAskingId(null);
    setBusyId(c.id);
    try {
      const res = await fetch("/api/stays/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id, action: "reject", reason }) });
      if (!res.ok) { toast({ message: "Couldn't do that." }); return; }
      publish(cands.filter((x) => x.id !== c.id));
      if (focusedId === c.id) onFocus(null);
    } finally {
      setBusyId(null);
    }
  }

  const briefObj = (brief?.brief ?? null) as StayBrief | null;
  const open = openId ? cands.find((c) => c.id === openId) ?? null : null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex items-end pointer-events-none"
        role="dialog"
        aria-label="Where to stay"
      >
        <div
          className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet flex flex-col pointer-events-auto"
          style={{ height: tall ? "88dvh" : "46dvh", transition: "height 220ms ease" }}
        >
          <div
            className="flex-shrink-0 cursor-grab select-none"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClick={() => setTall((t) => !t)}
            role="button"
            aria-label={tall ? "Show more map" : "Show the full list"}
          >
            <div className="flex justify-center pt-3 pb-2">
              <span className="w-9 h-[3px] rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-5 pb-2.5 border-b border-gray-100">
              <h2 className="font-display italic" style={{ fontSize: 23, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>Where to stay</h2>
              <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
              </button>
            </div>
          </div>

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
                {(brief?.area_text || brief?.split_text) && (
                  <div className="px-4 pt-3 pb-1 text-[12.5px] leading-relaxed" style={{ color: "rgba(26,26,46,0.75)" }}>
                    {brief?.area_text}{brief?.area_text && brief?.split_text ? " " : ""}
                    {brief?.split_text && <span style={{ color: SIENNA }}>{brief.split_text}</span>}
                  </div>
                )}

                {cands.map((c) => {
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
                      className="flex gap-2.5 px-4 py-3 border-b cursor-pointer active:bg-gray-50"
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
                        <p className="font-display italic truncate" style={{ fontSize: 17, lineHeight: 1.24, color: INK }}>
                          {c.name}{chosen ? <span className="ml-2 not-italic font-sans text-[10px] uppercase tracking-wide" style={{ color: SIENNA }}>Your stay</span> : null}
                        </p>
                        {meta && <p className="text-[12.5px] mt-[3px] leading-snug" style={{ color: CAPTION }}>{meta}</p>}
                        {c.flags?.length > 0 && <p className="text-[11px] font-medium mt-[3px]" style={{ color: SIENNA }}>{c.flags.join(" · ")}</p>}
                        {c.total != null && <p className="text-[12.5px] mt-[3px]" style={{ color: INK }}>{cad(Number(c.total))} for {nights} nights</p>}

                        {askingId === c.id ? (
                          <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[12.5px] self-center mr-1" style={{ color: SIENNA }}>Not for us:</span>
                            {REASONS.map((r) => (
                              <button key={r.key} type="button" onClick={() => reject(c, r.key)} className="h-[30px] px-3 rounded-full text-[12.5px] font-medium" style={{ color: INK, border: "1px solid rgba(26,26,46,0.2)" }}>
                                {r.label}
                              </button>
                            ))}
                            <button type="button" onClick={() => setAskingId(null)} className="h-[30px] px-2 text-[12.5px]" style={{ color: CAPTION }}>Keep</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={busy || chosen}
                              onClick={() => choose(c)}
                              className="h-[30px] px-3.5 rounded-full text-[12.5px] font-medium text-white disabled:opacity-60"
                              style={{ background: INK }}
                            >
                              {chosen ? "Chosen" : busy ? "…" : "Choose"}
                            </button>
                            {c.status === "candidate" && (
                              <button type="button" disabled={busy} onClick={() => save(c)} className="h-[30px] px-3.5 rounded-full text-[12.5px] font-medium" style={{ color: INK, border: "1px solid rgba(26,26,46,0.2)" }}>
                                Save
                              </button>
                            )}
                            {!chosen && (
                              <button type="button" aria-label="Not for us" onClick={() => setAskingId(c.id)} className="ml-auto h-[30px] px-2 text-[13px]" style={{ color: CAPTION }}>
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="px-4 pt-4">
                  <button type="button" onClick={run} disabled={running} className="text-[12.5px] font-medium" style={{ color: CAPTION }}>
                    {running ? "Looking…" : "Run again"}
                  </button>
                  {error && <p className="text-[12.5px] mt-2" style={{ color: SIENNA }}>{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {open && (
        <StayCardSheet
          candidate={open}
          brief={briefObj}
          startDate={trip.start_date}
          endDate={trip.end_date}
          nights={nights}
          busy={busyId === open.id}
          onChoose={() => choose(open)}
          onSave={() => save(open)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
