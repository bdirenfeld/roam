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
import { closedOnTrip, priceSigns, placeBlurb } from "@/lib/find/detail";
import { DATED } from "@/lib/find/ask";
import { findRequest } from "@/lib/find/request";
import { whatsOnUrl } from "@/lib/find/yearly";
import { distanceLine } from "@/lib/find/distance";
import { inferTypeOrSight } from "@/lib/places/inferType";
import Pieces from "@/components/ui/Pieces";
import { firstPlaceLine, hasPlacedCard } from "@/lib/map/firstPlace";

/**
 * Find (29 Sep 2026): places for what a base is short of, in Roam's own
 * categories. Travellers' picks (Claude reads Reddit and travel blogs, each
 * checked on Google) come first, then places Google rates well. Save puts
 * the place on the map as a saved pin; Plan my trip fits it into a day.
 * Opened from the Find chip beside Filter on the week's map and the phone
 * Map. Mock: https://claude.ai/artifact/Y7jvE2BRLyzFgropo5bqSG
 */
export default function FindSheet({
  trip, days, cards, onClose, onSaved, dock, onFocus, onTall, hadPlaces,
}: {
  trip: Trip;
  days: Day[];
  cards: Card[];
  /** The host's own count of placed pins (the phone Map's, which also knows map-search saves); unset: read from cards. */
  hadPlaces?: boolean;
  onClose: () => void;
  onSaved: (card: Card) => void;
  /** On a computer: "beside" the week's map (over the week), or "inside" a widened map. Unset: the phone's half sheet. */
  dock?: "beside" | "inside";
  /** The place opened, or null: the map shows it as a purple pin (lib/map/pulse showAt). */
  onFocus?: (r: FindResult | null) => void;
  /** The phone's half sheet raised to 88dvh (true) or back at half (false): the map's bottom row rides above it. */
  onTall?: (tall: boolean) => void;
}) {
  // Escape steps back from a place to the list, then closes.
  const [open, setOpen] = useState<FindResult | null>(null);
  // Where it is (1 Oct 2026: "it's hard to know where on the map it is"):
  // the map is told which place is open, and that none is when Find closes.
  const focusRef = useRef(onFocus); focusRef.current = onFocus;
  useEffect(() => { focusRef.current?.(open); }, [open]);
  useEffect(() => () => focusRef.current?.(null), []);
  useEscapeKey(() => (open ? setOpen(null) : onClose()));
  const dates = useMemo(() => days.map((d) => d.date).filter((d): d is string => !!d), [days]);
  const { toast } = useToast();
  const bases = useMemo(() => findBases(cards, trip), [cards, trip]);
  const [baseIdx, setBaseIdx] = useState(0);
  const base: FindBase | undefined = bases[Math.min(baseIdx, bases.length - 1)];
  const gaps = useMemo(() => (base ? gapsFor(base) : []), [base]);
  const [sub, setSub] = useState<string>("self_directed");
  const group = FIND_CATEGORIES.find((c) => c.subType === sub)?.type ?? "activity";
  const [ask, setAsk] = useState("");
  // Per search: Google's half (about a second) and the travellers' half (20-40 s,
  // instant when cached), each undefined until it answers.
  type Halves = { google?: FindResult[]; travellers?: FindResult[]; failed?: { google?: boolean; travellers?: boolean }; quota?: boolean };
  const [results, setResults] = useState<Record<string, Halves>>({});
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const asked = useRef<string | null>(null);
  const started = useRef<Set<string>>(new Set());

  const keyOf = (b: FindBase, s: string, q: string | null) => `${b.label}|${s}|${q ?? ""}`;
  // How far from where you sleep (1 Oct 2026, lib/find/distance): from the
  // hotel when the base has one, else from the middle of the base's places.
  const awayOf = (r: FindResult) => (base && Number.isFinite(r.lat) && Number.isFinite(r.lng) ? distanceLine(base, r, base.stayName ?? base.label) : null);
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
          const res = await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(findRequest(trip.id, base, s, mode, q)) });
          const j = await res.json() as { results?: FindResult[]; error?: string };
          if (!res.ok || !j.results) { failed = true; quota = res.status === 429; } else found = j.results;
        } catch { failed = true; }
        // A failed half can be asked again: tapping the chip retries it.
        if (failed) started.current.delete(k + "|" + mode);
        setResults((prev) => {
          const cur = prev[k] ?? {};
          // One half failing is not a failure while the other has places.
          return { ...prev, [k]: { ...cur, [mode]: found, failed: { ...cur.failed, [mode]: failed }, quota: (cur.quota ?? false) || quota } };
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
  const failed = bothIn && list.length === 0 && (now.failed?.google || now.failed?.travellers)
    ? (now.quota ? "Find is resting until tomorrow. Everything you saved is on your map." /* 6 Oct 2026, delight audit */ : "Couldn't find places just now. Tap the category to try again.")
    : null;
  const category = gaps.find((g) => g.category.subType === sub)?.category;

  const [tall, setTall] = useState(false);
  const save = async (r: FindResult) => {
    if (!category || saved.has(r.placeId)) return;
    // The journey's first place gets its own line (7 Oct 2026, delight
    // audit): read from its cards now, plus anything this sheet just saved
    // that the host has not handed back yet.
    const first = firstPlaceLine({ hadPlaces: !!hadPlaces || hasPlacedCard(cards) || saved.size > 0, destination: trip.destination });
    setSaved((prev) => new Set(prev).add(r.placeId));
    // On the phone a save drops it to half height, so the map above shows
    // the pin land (Brennan, 2 Oct 2026: after Save the sheet "is all the
    // way up" and covers the map). The host's bottom row follows via onTall.
    if (!dock) setTall(false);
    try {
      // A typed search's place is saved as what Google says it is, not as the
      // chip that happened to be on (a gelato shop found under Explore).
      const typed = (asked.current ?? "").split("|")[2] !== "";
      const kind = typed ? inferTypeOrSight(r.types, r.name) : { type: category.type, sub_type: category.subType };
      // A Ticketmaster show's venue is looked up on Google only when saved (lib/find/ticketmaster).
      let gid = r.placeId;
      if (gid.startsWith("tm:")) {
        const ac = await fetch(`/api/places/autocomplete?input=${encodeURIComponent([r.name, r.address].filter(Boolean).join(", "))}`).then((x) => x.json()) as { predictions?: { place_id: string }[] };
        gid = ac.predictions?.[0]?.place_id ?? "";
        if (!gid) throw new Error("venue");
      }
      const imp = await fetch("/api/places/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ google_place_ids: [gid], defaults: kind }) });
      const j = await imp.json() as { imported?: { place_id: string; title: string; created?: boolean }[] };
      const placeId = j.imported?.[0]?.place_id;
      if (!placeId) throw new Error("import");
      // An event's pin and card carry the event's name, not the venue's: a new
      // place is named after it (the venue stays its address). A place already
      // saved for its own sake keeps its name.
      let title = j.imported![0].title;
      if (r.title && j.imported![0].created) {
        const { error: named } = await createClient().from("places").update({ title: r.title }).eq("id", placeId);
        if (!named) title = r.title;
      }
      const card = {
        id: crypto.randomUUID(), trip_id: trip.id, day_id: null, list_id: null, place_id: placeId, status: "interested", position: 0,
        start_time: null, end_time: null, source_url: r.source?.url ?? null,
        details: { find: { why: r.why, source: r.source } }, ai_generated: false, confirmed: false,
      };
      const { error } = await createClient().from("cards").insert(card);
      if (error) throw error;
      onSaved({ ...card, created_at: new Date().toISOString(), place: { id: placeId, title, type: kind.type, sub_type: kind.sub_type, lat: r.lat, lng: r.lng, address: r.address } } as unknown as Card);
      toast({ message: first ?? `Saved ${r.title ?? r.name} to your map` });
    } catch {
      setSaved((prev) => { const n = new Set(prev); n.delete(r.placeId); return n; });
      toast({ message: "Couldn't save it. Try again." });
    }
  };

  // Never over the map (1 Oct 2026: "if you click Saved you can't really tell
  // where it's saved"): on a computer a panel docked against the map, over the
  // week (inside the map when it is widened); on the phone a half sheet with
  // the map above. Nothing dims the map, so a saved pin is seen landing
  // (lib/map/pulse). Escape or ✕ closes; the map stays usable while it is open.
  // The phone's half sheet (2 Oct 2026, Brennan: "when you scroll through it you
  // can barely see what's up there"): the controls took about 280 of its 450 px.
  // Now they scroll away with the results, scrolling raises the sheet, and
  // opening a place drops it back to half so the map above shows its pin.
  const onListScroll = (e: { currentTarget: HTMLDivElement }) => { if (!dock && !tall && e.currentTarget.scrollTop > 12) setTall(true); };
  useEffect(() => { if (open && !dock) setTall(false); }, [open, dock]);
  // The host lifts its Filter / Plan my trip row above the half sheet and steps
  // it aside at 88dvh (2 Oct 2026, Brennan: "I can't see buttons ... at the bottom").
  const tallRef = useRef(onTall); tallRef.current = onTall;
  useEffect(() => { if (!dock) tallRef.current?.(tall); }, [tall, dock]);
  const dragY = useRef<number | null>(null);
  const touchedAt = useRef(0);
  return (
    <div
      className={dock ? "absolute top-3 bottom-3 z-[60] flex" : "fixed inset-x-0 bottom-0 z-[70] flex items-end pointer-events-none"}
      style={dock === "beside" ? { right: "calc(100% + 10px)", width: 400 } : dock === "inside" ? { left: 12, width: 400, maxWidth: "calc(100% - 24px)" } : undefined}
    >
      <div
        role="dialog"
        aria-label="Find places"
        className={dock ? "w-full h-full bg-white rounded-2xl flex flex-col overflow-hidden" : "w-full max-w-mobile mx-auto bg-white rounded-t-2xl flex flex-col pointer-events-auto"}
        style={dock ? { boxShadow: "0 12px 32px rgba(26,26,46,0.22)" } : { height: tall ? "88dvh" : "50dvh", transition: "height 220ms ease", boxShadow: "0 -8px 24px rgba(26,26,46,0.18)" }}
      >
        {!dock && (
          // The handle, as Where to stay's: drag up for more results, down for more map; a tap toggles.
          <button
            type="button"
            aria-label={tall ? "Show more map" : "Show more results"}
            className="flex-shrink-0 flex justify-center pt-3 pb-1"
            style={{ touchAction: "none" }}
            onTouchStart={(e) => { dragY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              const from = dragY.current; dragY.current = null;
              if (from == null) return;
              const dy = e.changedTouches[0].clientY - from;
              touchedAt.current = Date.now();
              if (dy < -40) setTall(true); else if (dy > 40) setTall(false); else if (Math.abs(dy) < 12) setTall((t) => !t);
            }}
            onClick={() => { if (Date.now() - touchedAt.current > 700) setTall((t) => !t); }}
          >
            <span className="w-12 h-[4px] rounded-full bg-gray-300" />
          </button>
        )}
        <div data-testid="find-scroll" onScroll={onListScroll} className={dock ? "contents" : `flex-1 min-h-0 overflow-y-auto ${open ? "hidden" : ""}`}>
        <div className={`px-5 ${dock ? "pt-4" : "pt-1"} pb-3 flex flex-col gap-3 border-b`} style={{ borderColor: "rgba(26,26,46,0.08)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#1A1A2E]">Find places</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="relative w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              {/* Finger-sized targets on this sheet, drawn the same size (6 Oct
                  2026, taps audit): the ✕ grows to 44 wide, less above, where
                  the handle sits. Chips grow by half their 6px gap only, so no
                  two targets overlap. Save has its row's 12px padding to use. */}
              <span aria-hidden="true" data-testid="find-close-target" className="absolute -inset-x-1.5 -top-1 -bottom-1.5" />
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          {bases.length > 1 && (
            // Wraps, never scrolls: a row that scrolled cut Kagoshima off at the edge (29 Sep 2026).
            <div className="flex flex-wrap gap-1.5">
              {bases.map((b, i) => (
                <button key={b.label + i} type="button" onClick={() => { setBaseIdx(i); run(b, sub, null); warm(b); }}
                  className="relative h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap"
                  style={{ background: i === baseIdx ? "#1A1A2E" : "rgba(26,26,46,0.06)", color: i === baseIdx ? "#fff" : "#1A1A2E" }}>
                  <span aria-hidden="true" className="absolute -inset-[3px]" />
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {/* Two levels, as the map's Filter: Activity or Food, then that group's kinds.
              Eleven chips in one scrolling row were cut off at the edge (his note, 29 Sep 2026). */}
          <div className="flex gap-1.5 p-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.045)" }} role="tablist" aria-label="Activity or food">
            {(["activity", "food"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={group === t}
                onClick={() => { if (group === t) return; const first = FIND_CATEGORIES.find((c) => c.type === t)!.subType; setSub(first); run(base, first, null); }}
                className="flex-1 py-[7px] rounded-full text-[13px] font-semibold"
                style={group === t ? { background: "#fff", color: "#1A1A2E", boxShadow: "0 1px 3px rgba(26,26,46,0.16)" } : { color: "rgba(26,26,46,0.6)" }}>
                {t === "activity" ? "Activity" : "Food"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {gaps.filter((g) => g.category.type === group).map((g) => {
              const on = g.category.subType === sub;
              return (
                <button key={g.category.subType} type="button" onClick={() => { setSub(g.category.subType); void run(base, g.category.subType, null); }}
                  aria-pressed={on}
                  className="relative h-8 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap flex-shrink-0"
                  style={{ background: on ? "#B0541F" : "rgba(26,26,46,0.04)", color: on ? "#fff" : "rgba(26,26,46,0.7)", border: on ? "1px solid #B0541F" : "1px solid rgba(26,26,46,0.10)" }}>
                  <span aria-hidden="true" data-testid="find-chip-target" className="absolute -inset-[3px]" />
                  {/* No count: "Explore · 7" read as a recommended number (Brennan, 29 Sep 2026). */}
                  {g.category.label}
                </button>
              );
            })}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) void run(base, sub, ask.trim()); }}>
            <input id="find-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Search for something specific, e.g. "gelato in Pisa"`}
              className="w-full h-10 rounded-xl px-3 text-[14px] outline-none" style={{ background: "#F6F5F2" }} />
          </form>
        </div>

        <div className={`${dock ? "flex-1 overflow-y-auto" : ""} px-5 py-2 ${open ? "hidden" : ""}`}>
          {!base && <p className="py-6 text-[14px] text-activity/60">Set where the journey is going in Settings, and Find will start there.</p>}
          {/* Events are the area's yearly ones (lib/find/yearly); one-off shows are Google's, a tap away. */}
          {base && sub === "event" && (
            <p className="pt-1 pb-2 text-[12.5px] text-activity/60 leading-snug">
              Events held every year near {base.label}, on your dates. For concerts and one-off shows,{" "}
              <a href={whatsOnUrl(base.label, trip.start_date)} target="_blank" rel="noreferrer" className="underline underline-offset-2">see what&apos;s on</a>.
            </p>
          )}
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
                  <div className="text-[14px] font-semibold text-[#1A1A2E] truncate">{r.title ?? r.name}</div>
                  {r.title && <div className="text-[11.5px] text-activity/55 truncate">At {r.name}</div>}
                  <div className="text-[12.5px] text-activity/70 leading-snug">{r.why}</div>
                </button>
                {/* One line of text, not flex items (6 Oct 2026): as flex items the
                    "·" rode on the distance and was left dangling at the end of
                    the line whenever the source wrapped. Non-breaking spaces
                    hold the dot between its two neighbours. */}
                <div className="text-[11px] text-activity/45 mt-0.5 leading-snug" data-testid="find-meta">
                  {awayOf(r) && <><span className="text-activity/70 font-medium">{awayOf(r)}</span>{"\u00a0·\u00a0"}</>}
                  {r.source ? <a href={r.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{r.source.name}</a> : <span>{r.from === "travellers" ? "Travellers" : "Google"}</span>}
                </div>
                {r.kids && <div className="mt-1"><span className="px-1.5 rounded text-[10px] font-semibold" style={{ background: "#E7F3EC", color: "#1D7A55" }}>Good with kids</span></div>}
              </div>
              {/* A quiet outlined "+ Save" that turns into a green "✓ Saved" (6 Oct
                  2026, designer audit): seven black buttons down the list were the
                  loudest thing on the sheet. The marks are aria-hidden, so the
                  button is still named "Save" / "Saved". */}
              <button type="button" onClick={() => void save(r)} disabled={saved.has(r.placeId)} data-testid="find-save"
                className={`relative self-center h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap ${saved.has(r.placeId) ? "" : "hover:bg-[rgba(26,26,46,0.04)]"}`}
                style={saved.has(r.placeId)
                  ? { color: "#1D7A55" }
                  : { color: "#1A1A2E", background: "#fff", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.18)" }}>
                <span aria-hidden="true" data-testid="find-save-target" className="absolute -inset-1.5" />
                {saved.has(r.placeId)
                  ? <><span aria-hidden>✓ </span>Saved</>
                  : <><span aria-hidden>+ </span>Save</>}
              </button>
            </div>
          ))}
        </div>
        </div>
        {open && (
          <FindPlace r={open} dates={dates} away={awayOf(open)} saved={saved.has(open.placeId)} onSave={() => void save(open)} onBack={() => setOpen(null)} />
        )}
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
  editorial_summary?: { overview?: string };
};

/**
 * One place, opened from Find's list (29 Sep 2026: "if you click on any of
 * them, it doesn't open"). Photos, rating, the traveller's reason and page,
 * which of the journey's days it is shut, and where it is; Save stays at
 * the foot. Google details and photos load on open, not for the whole list.
 */
function FindPlace({ r, dates, away, saved, onSave, onBack }: { r: FindResult; dates: string[]; away: string | null; saved: boolean; onSave: () => void; onBack: () => void }) {
  const [d, setD] = useState<Details | null>(null);
  const [photos, setPhotos] = useState<string[]>(r.photo ? [r.photo] : []);
  const strip = useRef<HTMLDivElement>(null);
  const [canBack, setCanBack] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const edges = () => {
    const el = strip.current;
    if (!el) return;
    setCanBack(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(edges, [photos]);
  // One photo (96 px and the gap) at a time.
  const step = (dir: number) => strip.current?.scrollBy({ left: dir * 104 });
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
  const blurb = placeBlurb(r.why, d?.editorial_summary?.overview);
  const facts = [r.rating != null ? `★ ${r.rating}` : null, r.reviews ? `${r.reviews.toLocaleString("en-US")} reviews` : null, price].filter(Boolean).join(" · ");
  return (
    <div className="flex-1 overflow-y-auto flex flex-col" role="region" aria-label={r.name}>
      <div className="px-5 pt-3">
        <button type="button" onClick={onBack} className="min-h-[36px] text-[13px] font-medium text-[#B0541F]">‹ Back to results</button>
      </div>
      {/* What it is first, then how far, then the photos as a small strip
          (1 Oct 2026, Brennan: "you just end up seeing pictures which don't
          tell you much re what's the gist of it"). Mock: find-where.png. */}
      <div className="px-5 pb-2 flex flex-col gap-1.5">
        <h3 className="text-[19px] font-semibold text-[#1A1A2E] leading-snug">{r.title ?? r.name}</h3>
        {r.title && <div className="text-[13px] text-activity/60 -mt-1">At {r.name}</div>}
        {blurb && <p className="text-[14px] text-[#1A1A2E] leading-snug" data-testid="find-blurb">{blurb}</p>}
        {away && (
          <div className="text-[13px] font-semibold text-[#1A1A2E] flex items-center gap-1.5">
            {/* The map pin's own look (pulse.ts showAt): navy, orange ring. */}
            <span aria-hidden data-testid="find-away-dot" className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#1A1A2E", boxShadow: "0 0 0 2px #B0541F" }} />
            <span>{away}</span>
          </div>
        )}
        {facts && <div className="text-[13px] text-activity/70"><Pieces text={facts} /></div>}
        {d && (closed.length > 0
          ? <div className="text-[13px] font-medium text-[#B0541F]">Closed {closed.join(", ")}</div>
          : d.opening_hours?.weekday_text?.length ? <div className="text-[13px] text-activity/70">Open every day you&apos;re there</div> : null)}
        {r.kids && <span className="self-start px-1.5 rounded text-[11px] font-semibold" style={{ background: "#E7F3EC", color: "#1D7A55" }}>Good with kids</span>}
        {r.source && <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[12.5px] text-activity/60 underline underline-offset-2">From {r.source.name}</a>}
      </div>
      {/* Arrows as well as a swipe: with a mouse the strip could not be moved (29 Sep 2026). */}
      {photos.length > 0 && (
        <div className="relative flex-shrink-0">
          <div ref={strip} onScroll={edges} className="flex gap-2 overflow-x-auto scrollbar-none px-5 py-1 scroll-smooth">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photos.map((u) => <img key={u} src={u} alt="" loading="lazy" decoding="async" onLoad={edges} className="h-16 w-24 flex-shrink-0 rounded-lg object-cover bg-gray-100" />)}
          </div>
          {canBack && (
            <button type="button" aria-label="Previous photo" onClick={() => step(-1)}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-[16px] leading-none text-[#1A1A2E]"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>‹</button>
          )}
          {canNext && (
            <button type="button" aria-label="Next photo" onClick={() => step(1)}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-[16px] leading-none text-[#1A1A2E]"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>›</button>
          )}
        </div>
      )}
      <div className="px-5 pt-2 pb-4 flex flex-col gap-2">
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
