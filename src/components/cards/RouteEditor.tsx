"use client";

/**
 * The From / To editor (Brennan, 14 Nov 2026, approved mock, Google Maps
 * style). A tap on From or To turns the top of the card into two stacked boxes
 * with a swap button; you type right where you tapped. Your own places come
 * first, before any typing (lib/travel/routeCandidates: last night's stay,
 * today's stops, car parks used on the trip; then the nearest saved pins);
 * typing narrows them and Google's results go underneath. Whatever is in the
 * other box is never offered. Cancel backs out without a change.
 *
 * Used by the travel card and by Add travel, so both work the same way.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LegFrom } from "@/lib/travel/leg";
import { routeCandidates, type Candidate, type RouteCard } from "@/lib/travel/routeCandidates";

const INK = "#1A1A2E";
const CAP = "rgba(26,26,46,0.55)";

/** Every card in the journey that has a place, for the editor's lists. Fetched once when `enabled`. */
export function useRouteCards(tripId: string | null | undefined, enabled: boolean): RouteCard[] {
  const [cards, setCards] = useState<RouteCard[]>([]);
  useEffect(() => {
    if (!enabled || !tripId) return;
    let off = false;
    createClient()
      .from("cards")
      .select("id, day_id, status, archived, start_time, details, place:places ( id, title, type, sub_type, lat, lng, address, google_place_id )")
      .eq("trip_id", tripId)
      .not("place_id", "is", null)
      .not("archived", "is", true)
      .then(({ data }) => { if (!off) setCards((data ?? []) as unknown as RouteCard[]); });
    return () => { off = true; };
  }, [tripId, enabled]);
  return cards;
}

interface Prediction { place_id: string; structured_formatting: { main_text: string; secondary_text: string } }

const ICON: Record<Candidate["kind"], string> = { stay: "🏡", stop: "📍", used: "🅿️", trip: "📍", saved: "🔖" };

export default function RouteEditor({
  from, to, focus, cards, dayId, stay, biasLat, biasLng, onPick, onSwap, onCancel,
}: {
  from: LegFrom | null;
  to: LegFrom | null;
  focus: "from" | "to";
  cards: RouteCard[];
  dayId: string | null;
  stay: LegFrom | null;
  biasLat?: number | null;
  biasLng?: number | null;
  onPick: (which: "from" | "to", place: LegFrom) => void;
  /** Swap the two ends; shown only when both are set. */
  onSwap?: () => void;
  onCancel: () => void;
}) {
  const [which, setWhich] = useState<"from" | "to">(focus);
  useEffect(() => { setWhich(focus); }, [focus]);
  const [query, setQuery] = useState("");
  const other = which === "from" ? to : from;
  const { yours, saved } = useMemo(() => {
    const near = biasLat != null && biasLng != null ? { lat: biasLat, lng: biasLng } : (to ?? from);
    return routeCandidates({ cards, dayId, stay, exclude: other, near, query });
  }, [cards, dayId, stay, other, biasLat, biasLng, to, from, query]);

  // Google, under your own places, once something is typed.
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const token = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 2) { setPredictions([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ input: query, sessiontoken: token.current });
        if (biasLat != null && biasLng != null) { params.set("lat", String(biasLat)); params.set("lng", String(biasLng)); }
        const res = await fetch(`/api/places/autocomplete?${params.toString()}`);
        const data = await res.json();
        setPredictions(((data.predictions ?? []) as Prediction[]).slice(0, 4));
      } catch { setPredictions([]); }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query, biasLat, biasLng]);

  const pickGoogle = async (p: Prediction) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}&sessiontoken=${encodeURIComponent(token.current)}`);
      const r = (await res.json()).result;
      const lat = r?.geometry?.location?.lat, lng = r?.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        onPick(which, { title: r.name ?? p.structured_formatting.main_text, lat, lng, google_place_id: p.place_id, ...(r.formatted_address ? { address: r.formatted_address } : {}) });
      }
    } catch { /* stay in the editor */ } finally { setBusy(false); }
  };

  const pick = (c: Candidate) => {
    onPick(which, {
      title: c.title, lat: c.lat, lng: c.lng,
      ...(c.place_id ? { place_id: c.place_id } : {}),
      ...(c.google_place_id ? { google_place_id: c.google_place_id } : {}),
      ...(c.address ? { address: c.address } : {}),
    });
  };

  const field = (end: "from" | "to") => {
    const value = end === "from" ? from : to;
    if (end === which) {
      return (
        <input
          key={end}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={end === "to" ? "Where to?" : "Where from?"}
          aria-label={end === "to" ? "Where to" : "Where from"}
          className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none"
          style={{ background: "#fff", color: INK, boxShadow: `inset 0 0 0 2px ${INK}` }}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => { setWhich(end); setQuery(""); }}
        className="w-full text-left rounded-xl px-3 py-2.5 text-[15px] truncate"
        style={{ background: "#F3F4F6", color: value ? INK : "rgba(26,26,46,0.4)" }}
        aria-label={end === "from" ? `Change where this starts, now ${value?.title ?? "not set"}` : `Change where this goes, now ${value?.title ?? "not set"}`}
      >
        {value?.title ?? (end === "to" ? "Where to?" : "Where from?")}
      </button>
    );
  };

  const row = (c: Candidate) => (
    <button key={`${c.kind}-${c.title}-${c.lat}`} type="button" onClick={() => pick(c)} className="w-full flex items-center gap-3 py-2.5 text-left" style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}>
      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[14px]" style={{ background: "#F0EFEB" }} aria-hidden="true">{ICON[c.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium truncate" style={{ color: INK }}>{c.title}</span>
        <span className="block text-[12px] truncate" style={{ color: CAP }}>{c.sub}</span>
      </span>
    </button>
  );
  const head = (t: string) => <p className="mt-4 mb-1 text-[10.5px] uppercase" style={{ letterSpacing: "0.14em", color: "rgba(26,26,46,0.5)" }}>{t}</p>;

  return (
    <div data-testid="route-editor" className="mt-1">
      <div className="flex items-stretch gap-2.5">
        <div className="flex flex-col items-center pt-4 w-[10px]" aria-hidden="true">
          <span className="w-[9px] h-[9px] rounded-full" style={{ border: `2px solid ${INK}`, background: "#fff" }} />
          <span className="flex-1 my-1" style={{ borderLeft: "2px dotted rgba(26,26,46,0.3)", minHeight: 26 }} />
          <span className="w-[9px] h-[9px] rounded-full mb-4" style={{ background: INK }} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {field("from")}
          {field("to")}
        </div>
        {onSwap && from && to && (
          <button type="button" onClick={onSwap} aria-label="Swap start and end" className="relative self-center w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F3F4F6", color: INK }}>
            <span aria-hidden="true" className="absolute -inset-1" />
            ⇅
          </button>
        )}
      </div>
      <div className="flex justify-end mt-1.5">
        <button type="button" onClick={onCancel} className="relative text-[12.5px] underline underline-offset-2" style={{ color: CAP }}>
          <span aria-hidden="true" className="absolute -inset-y-[13px] -inset-x-2" />
          Cancel
        </button>
      </div>
      {/* Scrolls inside its own height so a long list never pushes the card off the phone. */}
      <div data-testid="route-editor-list" className="max-h-[44dvh] overflow-y-auto -mx-1 px-1">
        {yours.length > 0 && <>{head("Your places")}{yours.map(row)}</>}
        {saved.length > 0 && <>{head("Saved on your map")}{saved.map(row)}</>}
        {predictions.length > 0 && (
          <>
            {head("Everywhere")}
            {predictions.map((p) => (
              <button key={p.place_id} type="button" disabled={busy} onClick={() => void pickGoogle(p)} className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-60" style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[14px]" style={{ background: "#F0EFEB" }} aria-hidden="true">📍</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium truncate" style={{ color: INK }}>{p.structured_formatting.main_text}</span>
                  {p.structured_formatting.secondary_text && <span className="block text-[12px] truncate" style={{ color: CAP }}>{p.structured_formatting.secondary_text}</span>}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
