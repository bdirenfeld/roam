"use client";

// ── The empty hour's suggestions (6 Oct 2026, taps audit) ─────────────────
// Typing in the week's empty-hour box drops a short list: the journey's saved
// places first (lib/plan/hourSuggest), then Google's, from the same
// /api/places/autocomplete route and bias the map's search box uses, 300 ms
// after typing stops. Picking one makes the block already linked: a Google row
// is saved the way Find and the booking reader save one (bulk-import, which
// fills the pin, address and hours), then the card points at it. Enter with
// nothing picked still makes a plain note, as before.

import { useEffect, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
import type { Card, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { savedPlaceMatches, withoutSaved } from "@/lib/plan/hourSuggest";
import { predMain, predSecondary, type Prediction } from "@/lib/places/predictions";
import { PIN_COLORS, getMaterialIconHTML } from "@/lib/mapPins";

export type HourPick =
  | { kind: "saved"; place: Place }
  | { kind: "google"; prediction: Prediction };

export const hourPickName = (p: HourPick) => (p.kind === "saved" ? p.place.title : predMain(p.prediction));

/** A Google row saved as a place, the way Find saves one. Null on any failure. */
export async function importPrediction(p: Prediction): Promise<Place | null> {
  try {
    const imp = await fetch("/api/places/bulk-import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ google_place_ids: [p.place_id] }),
    }).then((r) => r.json()) as { imported?: { place_id: string }[] };
    const id = imp.imported?.[0]?.place_id;
    if (!id) return null;
    const { data } = await createClient().from("places")
      .select("id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours")
      .eq("id", id).maybeSingle();
    return (data as Place | null) ?? null;
  } catch {
    return null;
  }
}

interface Options {
  query: string;
  /** Every card on the journey, days and saved: where the saved half looks. */
  cards: Card[];
  bias: { lat: number; lng: number } | null;
  countries: string[];
}

export function useHourSuggest({ query, cards, bias, countries }: Options) {
  const [google, setGoogle] = useState<Prediction[]>([]);
  const [active, setActive] = useState(-1);
  const token = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
  const saved = savedPlaceMatches(query, cards);
  const shown = withoutSaved(google, saved);
  const items: HourPick[] = [
    ...saved.map((place) => ({ kind: "saved" as const, place })),
    ...shown.map((prediction) => ({ kind: "google" as const, prediction })),
  ];

  useEffect(() => {
    setActive(-1);
    const q = query.trim();
    if (q.length < 2) { setGoogle([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ input: q, sessiontoken: token.current });
        if (bias) { params.set("lat", String(bias.lat)); params.set("lng", String(bias.lng)); }
        if (countries.length) params.set("countries", countries.join("|"));
        const res = await fetch(`/api/places/autocomplete?${params.toString()}`);
        const data = res.ok ? ((await res.json()) as { predictions?: Prediction[] }) : {};
        if (live) setGoogle(data.predictions ?? []);
      } catch {
        if (live) setGoogle([]);
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Arrow keys move through the list; returns the highlighted pick on Enter, if any. */
  const onKey = (e: React.KeyboardEvent): HourPick | null => {
    if (!items.length) return null;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    if (e.key === "Enter" && active >= 0 && active < items.length) return items[active];
    return null;
  };

  return { items, savedCount: saved.length, active, onKey };
}

export function HourSuggestList({ items, savedCount, active, onPick }: {
  items: HourPick[]; savedCount: number; active: number; onPick: (p: HourPick) => void;
}) {
  if (!items.length) return null;
  const label = (text: string) => (
    <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-activity/45">{text}</div>
  );
  return (
    <div
      role="listbox"
      aria-label="Places that match"
      data-testid="hour-suggest"
      // Keep the box's focus: a blur would make the plain note before the pick lands.
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-0 top-full mt-1 w-[260px] max-w-[80vw] bg-white rounded-[10px] overflow-hidden z-[20] text-left"
      style={{ border: "1px solid rgba(26,26,46,0.10)", boxShadow: "0 10px 30px rgba(26,26,46,0.16)" }}
    >
      {items.map((it, i) => {
        const isSaved = it.kind === "saved";
        const title = hourPickName(it);
        const sub = isSaved ? it.place.address : predSecondary(it.prediction);
        return (
          <div key={isSaved ? `s-${it.place.id}` : `g-${it.prediction.place_id}`}>
            {i === 0 && savedCount > 0 && label("Saved")}
            {i === savedCount && label("From Google")}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              onClick={() => onPick(it)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[rgba(26,26,46,0.04)] ${i === active ? "bg-[rgba(26,26,46,0.05)]" : ""}`}
            >
              <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(26,26,46,0.05)", color: isSaved ? PIN_COLORS[it.place.type] : "rgba(26,26,46,0.55)" }}>
                {isSaved
                  ? <span className="inline-flex" dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(it.place.sub_type, 13) }} />
                  : <MapPin size={13} weight="light" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-[#1A1A2E] truncate">{title}</span>
                {sub && <span className="block text-[10.5px] text-activity/55 truncate">{sub}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
