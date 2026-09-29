"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Day, Trip } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { findBases, gapsFor, FIND_CATEGORIES, type FindBase } from "@/lib/find/gaps";

/** The kinds whose travellers' picks are fetched before they are asked for. */
const WARM_TRAVELLERS = new Set(["self_directed", "restaurant", "coffee", "dessert", "bar"]);
import { combineFind, type FindResult } from "@/lib/find/merge";
import { closedOnTrip, priceSigns } from "@/lib/find/detail";
import { nearCentres, NEAR_PLAN } from "@/lib/find/near";
import { DATED } from "@/lib/find/ask";

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
  // Escape steps back from a place to the list, then closes.
  const [open, setOpen] = useState<FindResult | null>(null);
  useEscapeKey(() => (open ? setOpen(null) : onClose()));
  const dates = useMemo(() => days.map((d) => d.date).filter((d): d is string => !!d), [days]);
  const { toast } = useToast();
  const bases = useMemo(() => findBases(cards, trip), [cards, trip]);
  const [baseIdx, setBaseIdx] = useState(0);
  const base: FindBase | undefined = bases[Math.min(baseIdx, bases.length - 1)];
  const gaps = useMemo(() => (base ? gapsFor(base) : []), [base]);
  const [sub, setSub] = useState<string>("self_directed");
  const [ask, setAsk] = useState("");
  // Per search: Google's half (about a second) and the travellers' half (20-40 s,
  // instant when cached), each undefined until it answers.
  type Halves = { google?: FindResult[]; travellers?: FindResult[]; failed?: boolean; quota?: boolean };
  const [results, setResults] = useState<Record<string, Halves>>({});
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const asked = useRef<string | null>(null);
  const started = useRef<Set<string>>(new Set());

  const keyOf = (b: FindBase, s: string, q: string | null) => `${b.label}|${s}|${q ?? ""}`;
  // Coffee and dessert: where the base's sights cluster, so they come from near the day (lib/find/near).
  const nearOf = (b: FindBase, s: string) => (NEAR_PLAN.has(s) && b.sights.length
    ? { near: nearCentres(b.sights, 4), nearNames: b.sights.slice(0, 6).map((x) => x.title) }
    : {});
  const [, bump] = useState(0);
  // Fetch one half of one search, once. Shown or not, the answer is kept, so
  // a chip tapped later is already there.
  const load = (base: FindBase, s: string, q: string | null, modes: ("google" | "travellers")[]) => {
    const k = keyOf(base, s, q);
    for (const mode of modes) {
      if (started.current.has(k + "|" + mode)) continue;
      started.current.add(k + "|" + mode);
      void (async () => {
        let found: FindResult[] = [], failed = false, quota = false;
        try {
          const res = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, base: { label: base.label, lat: base.lat, lng: base.lng }, subType: s, ask: q, mode, ...nearOf(base, s) }) });
          const j = await res.json() as { results?: FindResult[]; error?: string };
          if (!res.ok || !j.results) { failed = true; quota = res.status === 429; } else found = j.results;
        } catch { failed = true; }
        setResults((prev) => {
          const cur = prev[k] ?? {};
          // One half failing is not a failure while the other has places.
          return { ...prev, [k]: { ...cur, [mode]: found, failed: (cur.failed ?? false) || failed, quota: (cur.quota ?? false) || quota } };
        });
      })();
    }
  };
  const run = (b: FindBase | undefined, s: string, q: string | null) => {
    if (!b) return;
    asked.current = keyOf(b, s, q);
    setOpen(null);
    bump((n) => n + 1);
    load(b, s, q, ["google", "travellers"]);
  };
  // Tapping across the chips should never wait (29 Sep 2026: "make sure things
  // load faster"). On open, and on a new base, every category's Google half is
  // fetched (a second each, cheap), and the travellers' half for the kinds a
  // trip uses most. The server keeps both for a month for everyone, so a city
  // someone has searched is instant.
  const warm = (b: FindBase | undefined) => {
    if (!b) return;
    for (const c of FIND_CATEGORIES) load(b, c.subType, null, WARM_TRAVELLERS.has(c.subType) ? ["google", "travellers"] : ["google"]);
  };

  // First open: look straight away, then warm the rest.
  useEffect(() => {
    run(base, sub, null);
    warm(base);
    // Once, on open; later searches come from the chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now: Halves = (asked.current && results[asked.current]) || {};
  const list = combineFind(now.travellers, now.google);
  const bothIn = now.google !== undefined && now.travellers !== undefined;
  const loading = list.length === 0 && !bothIn;
  const reading = list.length > 0 && now.travellers === undefined;
  const failed = bothIn && list.length === 0 && now.failed
    ? (now.quota ? "You've used today's finds. Try again tomorrow." : "Couldn't find places just now. Try again.")
    : null;
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
                <button key={b.label + i} type="button" onClick={() => { setBaseIdx(i); run(b, sub, null); warm(b); }}
                  className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap"
                  style={{ background: i === baseIdx ? "#1A1A2E" : "rgba(26,26,46,0.06)", color: i === baseIdx ? "#fff" : "#1A1A2E" }}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-5 px-5">
            {gaps.map((g) => {
              const on = g.category.subType === sub;
              return (
                <button key={g.category.subType} type="button" onClick={() => { setSub(g.category.subType); void run(base, g.category.subType, null); }}
                  aria-pressed={on}
                  className="h-8 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap flex-shrink-0"
                  style={{ background: on ? "#B0541F" : "rgba(26,26,46,0.04)", color: on ? "#fff" : "rgba(26,26,46,0.7)", border: on ? "1px solid #B0541F" : "1px solid rgba(26,26,46,0.10)" }}>
                  {/* No count: "Explore · 7" read as a recommended number (Brennan, 29 Sep 2026). */}
                  {g.category.label}
                </button>
              );
            })}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) void run(base, sub, ask.trim()); }}>
            <input id="find-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Or ask: "ramen open late"`}
              className="w-full h-10 rounded-xl px-3 text-[14px] outline-none" style={{ background: "#F6F5F2" }} />
          </form>
        </div>

        {open && (
          <FindPlace r={open} dates={dates} saved={saved.has(open.placeId)} onSave={() => void save(open)} onBack={() => setOpen(null)} />
        )}
        <div className={`flex-1 overflow-y-auto px-5 py-2 ${open ? "hidden" : ""}`}>
          {!base && <p className="py-6 text-[14px] text-activity/60">Set where the journey is going in Settings, and Find will start there.</p>}
          {base && loading && <p className="py-6 text-[14px] text-activity/60">{DATED.has(sub) ? "Checking what's on while you're there…" : "Looking…"}</p>}
          {failed && <p className="py-6 text-[14px] text-[#B0541F]">{failed}</p>}
          {!failed && base && bothIn && list.length === 0 && (
            <p className="py-6 text-[14px] text-activity/60">Nothing new to add here.</p>
          )}
          {reading && <p className="pt-2 pb-1 text-[12px] text-activity/50">Adding what travellers recommend…</p>}
          {!loading && list.map((r) => (
            <div key={r.placeId} className="flex gap-3 py-3 border-b" style={{ borderColor: "rgba(26,26,46,0.07)" }}>
              <button type="button" onClick={() => setOpen(r)} aria-label={`More about ${r.name}`} className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: category?.type === "food" ? "rgba(124,58,237,0.12)" : "rgba(29,158,117,0.14)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.photo && <img src={r.photo} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              </button>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => setOpen(r)} className="block w-full text-left">
                  <div className="text-[14px] font-semibold text-[#1A1A2E] truncate">{r.name}</div>
                  <div className="text-[12.5px] text-activity/70 leading-snug">{r.why}</div>
                </button>
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

type Details = {
  photos?: { photo_reference: string }[];
  opening_hours?: { weekday_text?: string[] };
  website?: string;
  url?: string;
  price_level?: number;
};

/**
 * One place, opened from Find's list (29 Sep 2026: "if you click on any of
 * them, it doesn't open"). Photos, rating, the traveller's reason and page,
 * which of the journey's days it is shut, and where it is; Save stays at
 * the foot. Google details and photos load on open, not for the whole list.
 */
function FindPlace({ r, dates, saved, onSave, onBack }: { r: FindResult; dates: string[]; saved: boolean; onSave: () => void; onBack: () => void }) {
  const [d, setD] = useState<Details | null>(null);
  const [photos, setPhotos] = useState<string[]>(r.photo ? [r.photo] : []);
  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(r.placeId)}`).then((x) => x.json()).catch(() => null) as { result?: Details } | null;
      if (!live) return;
      const det = res?.result ?? {};
      setD(det);
      const refs = (det.photos ?? []).slice(0, 4).map((p) => p.photo_reference);
      const urls = await Promise.all(refs.map((ref) =>
        fetch(`/api/places/photo/by-reference?photo_reference=${encodeURIComponent(ref)}&maxwidth=640`).then((x) => x.json()).then((j: { url?: string }) => j.url ?? null).catch(() => null)));
      const got = urls.filter((u): u is string => !!u);
      if (live && got.length) setPhotos(got);
    })();
    return () => { live = false; };
  }, [r.placeId]);

  const closed = closedOnTrip(d?.opening_hours?.weekday_text, dates);
  const price = priceSigns(d?.price_level);
  const facts = [r.rating != null ? `★ ${r.rating}` : null, r.reviews ? `${r.reviews.toLocaleString("en-US")} reviews` : null, price].filter(Boolean).join(" · ");
  return (
    <div className="flex-1 overflow-y-auto flex flex-col" role="region" aria-label={r.name}>
      <div className="px-5 pt-3">
        <button type="button" onClick={onBack} className="min-h-[36px] text-[13px] font-medium text-[#B0541F]">‹ Back to results</button>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none px-5 py-2 flex-shrink-0">
        {photos.length > 0
          // eslint-disable-next-line @next/next/no-img-element
          ? photos.map((u) => <img key={u} src={u} alt="" className="h-40 w-60 flex-shrink-0 rounded-xl object-cover bg-gray-100" />)
          : <div className="h-40 w-full rounded-xl bg-gray-100" aria-hidden />}
      </div>
      <div className="px-5 pb-4 flex flex-col gap-2">
        <h3 className="text-[18px] font-semibold text-[#1A1A2E] leading-snug">{r.name}</h3>
        {facts && <div className="text-[13px] text-activity/70">{facts}</div>}
        <p className="text-[14px] text-[#1A1A2E] leading-snug">{r.why}</p>
        {r.source && <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-activity/60 underline underline-offset-2">From {r.source.name}</a>}
        {r.kids && <span className="self-start px-1.5 rounded text-[11px] font-semibold" style={{ background: "#E7F3EC", color: "#1D7A55" }}>Good with kids</span>}
        {d && (closed.length > 0
          ? <div className="text-[13px] font-medium text-[#B0541F]">Closed {closed.join(", ")}</div>
          : d.opening_hours?.weekday_text?.length ? <div className="text-[13px] text-activity/70">Open every day you&apos;re there</div> : null)}
        <div className="text-[13px] text-activity/70">{r.address}</div>
        <div className="flex gap-4 text-[13px] font-medium">
          {d?.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[#1A1A2E] underline underline-offset-2">Google Maps</a>}
          {d?.website && <a href={d.website} target="_blank" rel="noreferrer" className="text-[#1A1A2E] underline underline-offset-2">Website</a>}
        </div>
        {d?.opening_hours?.weekday_text?.length ? (
          <details className="text-[12.5px] text-activity/70">
            <summary className="cursor-pointer">Hours</summary>
            <ul className="mt-1">{d.opening_hours.weekday_text.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        ) : null}
      </div>
      <div className="sticky bottom-0 mt-auto px-5 py-3 bg-white border-t" style={{ borderColor: "rgba(26,26,46,0.08)" }}>
        <button type="button" onClick={onSave} disabled={saved}
          className="w-full h-11 rounded-full text-[14px] font-semibold"
          style={{ background: saved ? "#E7F3EC" : "#1A1A2E", color: saved ? "#1D7A55" : "#fff" }}>
          {saved ? "Saved to your map ✓" : "Save to your map"}
        </button>
      </div>
    </div>
  );
}
