"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Day, Trip } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { findBases, gapsFor, type FindBase } from "@/lib/find/gaps";
import type { FindResult } from "@/lib/find/merge";

/**
 * Find (29 Sep 2026): places for what a base is short of, in Roam's own
 * categories. Travellers' picks (Claude reads Reddit and travel blogs, each
 * checked on Google) come first, then places Google rates well. Save puts
 * the place on the map as a saved pin; Plan my trip fits it into a day.
 * Opened from the Find chip beside Filter on the week's map and the phone
 * Map. Mock: https://claude.ai/artifact/Y7jvE2BRLyzFgropo5bqSG
 */
export default function FindSheet({
  trip, days, cards, onClose, onSaved,
}: {
  trip: Trip;
  days: Day[];
  cards: Card[];
  onClose: () => void;
  onSaved: (card: Card) => void;
}) {
  void days;
  useEscapeKey(onClose);
  const { toast } = useToast();
  const bases = useMemo(() => findBases(cards, trip), [cards, trip]);
  const [baseIdx, setBaseIdx] = useState(0);
  const base: FindBase | undefined = bases[Math.min(baseIdx, bases.length - 1)];
  const gaps = useMemo(() => (base ? gapsFor(base) : []), [base]);
  const [sub, setSub] = useState<string>(() => (base ? (gapsFor(base).find((g) => g.short && g.want != null) ?? gapsFor(base)[0]).category.subType : "self_directed"));
  const [ask, setAsk] = useState("");
  const [results, setResults] = useState<Record<string, FindResult[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const asked = useRef<string | null>(null);

  const keyOf = (b: FindBase, s: string, q: string | null) => `${b.label}|${s}|${q ?? ""}`;
  const [, bump] = useState(0);
  const run = async (b: FindBase | undefined, s: string, q: string | null) => {
    if (!b) return;
    const base = b;
    const k = keyOf(base, s, q);
    asked.current = k;
    bump((n) => n + 1);
    if (results[k]) return;
    setLoading(k); setFailed(null);
    try {
      const res = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, base: { label: base.label, lat: base.lat, lng: base.lng }, subType: s, ask: q }) });
      const j = await res.json() as { results?: FindResult[]; error?: string };
      if (!res.ok || !j.results) throw new Error(j.error ?? "failed");
      setResults((prev) => ({ ...prev, [k]: j.results! }));
    } catch (e) {
      setFailed(e instanceof Error && /limit|quota/i.test(e.message) ? "You've used today's finds. Try again tomorrow." : "Couldn't find places just now. Try again.");
    } finally {
      setLoading((cur) => (cur === k ? null : cur));
    }
  };

  // First open: look straight away for the first gap.
  useEffect(() => {
    void run(base, sub, null);
    // Once, on open; later searches come from the chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = (asked.current && results[asked.current]) || [];
  const category = gaps.find((g) => g.category.subType === sub)?.category;

  const save = async (r: FindResult) => {
    if (!category || saved.has(r.placeId)) return;
    setSaved((prev) => new Set(prev).add(r.placeId));
    try {
      const imp = await fetch("/api/places/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ google_place_ids: [r.placeId], defaults: { type: category.type, sub_type: category.subType } }) });
      const j = await imp.json() as { imported?: { place_id: string; title: string }[] };
      const placeId = j.imported?.[0]?.place_id;
      if (!placeId) throw new Error("import");
      const card = {
        id: crypto.randomUUID(), trip_id: trip.id, day_id: null, list_id: null, place_id: placeId, status: "interested", position: 0,
        start_time: null, end_time: null, source_url: r.source?.url ?? null,
        details: { find: { why: r.why, source: r.source } }, ai_generated: false, confirmed: false,
      };
      const { error } = await createClient().from("cards").insert(card);
      if (error) throw error;
      onSaved({ ...card, created_at: new Date().toISOString(), place: { id: placeId, title: j.imported![0].title, type: category.type, sub_type: category.subType, lat: r.lat, lng: r.lng, address: r.address } } as unknown as Card);
      toast({ message: `Saved ${r.name} to your map` });
    } catch {
      setSaved((prev) => { const n = new Set(prev); n.delete(r.placeId); return n; });
      toast({ message: "Couldn't save it. Try again." });
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" onClick={onClose} style={{ background: "rgba(26,26,46,0.28)" }}>
      <div
        role="dialog"
        aria-label="Find places"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:w-[460px] bg-white rounded-t-2xl md:rounded-2xl flex flex-col max-h-[88vh]"
        style={{ boxShadow: "0 16px 40px rgba(26,26,46,0.22)" }}
      >
        <div className="px-5 pt-4 pb-3 flex flex-col gap-3 border-b" style={{ borderColor: "rgba(26,26,46,0.08)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#1A1A2E]">Find places</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          {bases.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {bases.map((b, i) => (
                <button key={b.label + i} type="button" onClick={() => { setBaseIdx(i); void run(b, sub, null); }}
                  className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap"
                  style={{ background: i === baseIdx ? "#1A1A2E" : "rgba(26,26,46,0.06)", color: i === baseIdx ? "#fff" : "#1A1A2E" }}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {gaps.map((g) => {
              const on = g.category.subType === sub;
              return (
                <button key={g.category.subType} type="button" onClick={() => { setSub(g.category.subType); void run(base, g.category.subType, null); }}
                  aria-pressed={on}
                  className="h-8 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap"
                  style={{ background: on ? "#B0541F" : g.short ? "rgba(176,84,31,0.06)" : "rgba(26,26,46,0.04)", color: on ? "#fff" : g.short ? "#B0541F" : "rgba(26,26,46,0.6)", border: on ? "1px solid #B0541F" : g.short ? "1px solid rgba(176,84,31,0.35)" : "1px solid rgba(26,26,46,0.10)" }}>
                  {g.category.label} · {g.want != null ? `${g.have} of ${g.want}` : g.have}
                </button>
              );
            })}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) void run(base, sub, ask.trim()); }}>
            <input id="find-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Or ask: "ramen open late"`}
              className="w-full h-10 rounded-xl px-3 text-[14px] outline-none" style={{ background: "#F6F5F2" }} />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {!base && <p className="py-6 text-[14px] text-activity/60">Set where the journey is going in Settings, and Find will start there.</p>}
          {loading && <p className="py-6 text-[14px] text-activity/60">Looking at what travellers recommend…</p>}
          {!loading && failed && <p className="py-6 text-[14px] text-[#B0541F]">{failed}</p>}
          {!loading && !failed && base && list.length === 0 && asked.current && results[asked.current] && (
            <p className="py-6 text-[14px] text-activity/60">Nothing new to add here.</p>
          )}
          {!loading && list.map((r) => (
            <div key={r.placeId} className="flex gap-3 py-3 border-b" style={{ borderColor: "rgba(26,26,46,0.07)" }}>
              <div className="w-12 h-12 rounded-lg flex-shrink-0" style={{ background: category?.type === "food" ? "rgba(124,58,237,0.12)" : "rgba(29,158,117,0.14)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#1A1A2E] truncate">{r.name}</div>
                <div className="text-[12.5px] text-activity/70 leading-snug">{r.why}</div>
                <div className="text-[11px] text-activity/45 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {r.from === "travellers" && r.source ? <a href={r.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{r.source.name}</a> : <span>{r.from === "travellers" ? "Travellers" : "Google"}</span>}
                  {r.kids && <span className="px-1.5 rounded text-[10px] font-semibold" style={{ background: "#E7F3EC", color: "#1D7A55" }}>Good with kids</span>}
                </div>
              </div>
              <button type="button" onClick={() => void save(r)} disabled={saved.has(r.placeId)}
                className="self-center h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap"
                style={{ background: saved.has(r.placeId) ? "#E7F3EC" : "#1A1A2E", color: saved.has(r.placeId) ? "#1D7A55" : "#fff" }}>
                {saved.has(r.placeId) ? "Saved ✓" : "Save"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
