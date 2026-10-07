"use client";

/**
 * The travel leg's controls (7 Oct 2026, mock d13 approved; slimmed the same
 * day, mock t05). One component file, two hosts: the card sheet (the quiet
 * "From Lusaka · change" line under the route, the caption, the mode pills
 * behind "Change how you travel") and the Add-to-this-day sheet (From, then
 * the mode once From is set). The rules live in lib/travel/leg; this file is
 * only the inputs.
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LEG_MODES, defaultFromForDay, formatLegDuration,
  type LegDay, type LegFrom, type LegMode,
} from "@/lib/travel/leg";

const INK = "#1A1A2E";
const CAP = "rgba(26,26,46,0.62)";

/**
 * Last night's stay for a day (his tweak 2: a leg added by hand starts there,
 * so the start is rarely typed). Fetched once when `enabled`; null until it
 * answers, and null when there is none. Reads every card of the journey that
 * has a place, because stayRuns needs the whole run of hotels to know which
 * one covers the night before.
 */
export function useDefaultFrom(tripId: string | null | undefined, dayId: string | null | undefined, enabled: boolean): LegFrom | null {
  const [from, setFrom] = useState<LegFrom | null>(null);
  useEffect(() => {
    if (!enabled || !tripId || !dayId) return;
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      const [daysRes, cardsRes] = await Promise.all([
        supabase.from("days").select("id, date").eq("trip_id", tripId),
        supabase
          .from("cards")
          .select("id, day_id, place_id, status, start_time, details, place:places ( id, title, sub_type, lat, lng, google_place_id )")
          .eq("trip_id", tripId)
          .not("place_id", "is", null),
      ]);
      if (cancelled || daysRes.error || cardsRes.error) return;
      const byDay = new Map<string, LegDay>();
      for (const d of (daysRes.data ?? []) as { id: string; date: string }[]) byDay.set(d.id, { id: d.id, date: d.date, cards: [] });
      for (const c of (cardsRes.data ?? []) as unknown as (LegDay["cards"][number] & { day_id: string | null })[]) {
        if (c.day_id) byDay.get(c.day_id)?.cards.push(c);
      }
      setFrom(defaultFromForDay(Array.from(byDay.values()), dayId));
    };
    load().catch(() => { /* fails quiet: the field just has no suggestion */ });
    return () => { cancelled = true; };
  }, [tripId, dayId, enabled]);
  return from;
}

interface Prediction {
  place_id: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

/**
 * The search for a leg's start: "Last night's stay" first when it is not
 * already the start, then a town / station / port search. Shared by the
 * Add-to-this-day row (LegFromField) and the card sheet's "From Lusaka ·
 * change" line (7 Oct 2026, mock t05), which opens it under the header.
 */
export function LegFromSearch({
  value, suggestion, onPick, biasLat, biasLng,
}: {
  value: LegFrom | null;
  suggestion?: LegFrom | null;
  onPick: (from: LegFrom) => void;
  biasLat?: number | null;
  biasLng?: number | null;
}) {
  const [query, setQuery] = useState("");
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
        setPredictions(((data.predictions ?? []) as Prediction[]).slice(0, 5));
      } catch { setPredictions([]); }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query, biasLat, biasLng]);

  const pick = async (p: Prediction) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}&sessiontoken=${encodeURIComponent(token.current)}`);
      const data = await res.json();
      const r = data.result;
      const lat = r?.geometry?.location?.lat, lng = r?.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        onPick({ title: r.name ?? p.structured_formatting.main_text, lat, lng, google_place_id: p.place_id });
      }
    } catch { /* stay in the search */ } finally {
      setBusy(false);
    }
  };

  const offer = suggestion && (!value || value.title !== suggestion.title) ? suggestion : null;

  return (
    <div className="pt-2 pb-1" data-testid="leg-from-search">
      {offer && (
        <button
          type="button"
          onClick={() => onPick(offer)}
          // 44px tall (7 Oct 2026, re-audit).
          className="w-full text-left py-2 min-h-[44px] text-[13px]"
          style={{ color: INK }}
        >
          Last night&rsquo;s stay · {offer.title}
        </button>
      )}
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a town, station or port"
        className="w-full rounded-full px-3.5 py-2 text-[14px] outline-none"
        style={{ background: "#F3F4F6", color: INK }}
      />
      {predictions.map((p) => (
        <button
          key={p.place_id}
          type="button"
          disabled={busy}
          onClick={() => void pick(p)}
          className="w-full text-left py-2.5 disabled:opacity-60"
          style={{ borderBottom: "1px solid rgba(26,26,46,0.06)" }}
        >
          <span className="block text-[13px] font-medium truncate" style={{ color: INK }}>{p.structured_formatting.main_text}</span>
          {p.structured_formatting.secondary_text && (
            <span className="block text-[12px] truncate" style={{ color: CAP }}>{p.structured_formatting.secondary_text}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** The start of a leg on the Add-to-this-day sheet: a row that reads "From  Lusaka"; a tap searches. */
export function LegFromField({
  value, suggestion, onChange, readOnly = false, biasLat, biasLng,
}: {
  value: LegFrom | null;
  /** Last night's stay, offered first when it is not already the start. */
  suggestion?: LegFrom | null;
  onChange: (from: LegFrom) => void;
  readOnly?: boolean;
  biasLat?: number | null;
  biasLng?: number | null;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <div className="flex items-baseline gap-3 py-2" style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}>
        <span className="w-12 shrink-0 text-[11px] uppercase" style={{ letterSpacing: "0.12em", color: CAP }}>From</span>
        {readOnly ? (
          <span className="text-[14px]" style={{ color: INK }}>{value?.title ?? "—"}</span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={value ? `Change where this starts, now ${value.title}` : "Set where this starts"}
            className="relative text-left text-[14px] min-h-[28px] hover:underline"
            style={{ color: value ? INK : CAP }}
          >
            {/* 44px to the finger, same look (7 Oct 2026, re-audit): 8px up and
                down, inside the row's own padding. */}
            <span aria-hidden="true" data-testid="leg-from-target" className="absolute -inset-y-2 inset-x-0" />
            {value?.title ?? "Where you leave from"}
          </button>
        )}
      </div>
      {editing && !readOnly && (
        <LegFromSearch
          value={value}
          suggestion={suggestion}
          onPick={(f) => { onChange(f); setEditing(false); }}
          biasLat={biasLat}
          biasLng={biasLng}
        />
      )}
    </div>
  );
}

/**
 * The card sheet's one quiet line under the route (7 Oct 2026, mock t05):
 * "From Lusaka · change". It replaced the From and To rows, which said the
 * route a second and third time. A transit card with no start yet reads
 * "Add where you leave from"; a guest sees "From Lusaka" and nothing to tap.
 */
export function LegFromLine({
  from, readOnly = false, open, onToggle,
}: {
  from: LegFrom | null;
  readOnly?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (readOnly && !from) return null;
  return (
    <p className="mt-1 text-[12.5px] leading-snug" style={{ color: CAP }} data-testid="leg-from-line">
      {from && <>From {from.title}</>}
      {!readOnly && (
        <>
          {from && " · "}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={from ? `Change where this starts, now ${from.title}` : "Set where this starts"}
            className="relative underline underline-offset-2"
            style={{ color: from ? CAP : INK }}
          >
            {/* 44px to the finger on a 12.5px word, never onto a neighbour: down
                only the 4px to the address (the Directions button), up 23px over
                the leg's title, which is plain text. Under an editable title (a
                transit card with no start yet) it reaches up 4px only. */}
            <span aria-hidden="true" data-testid="leg-from-target" className={`absolute -bottom-1 -inset-x-2 ${from ? "-top-[23px]" : "-top-1"}`} />
            {from ? "change" : "Add where you leave from"}
          </button>
        </>
      )}
    </p>
  );
}

/** Drive / Bus / Train / Ferry, one row of quiet pills. */
export function LegModePicker({ value, onChange, readOnly = false }: { value: LegMode | null; onChange: (m: LegMode) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2" role="radiogroup" aria-label="How you travel">
      {LEG_MODES.map((m) => {
        // None lit until someone picks (7 Oct 2026, mock t05). It used to light
        // Drive for a leg with no mode, guessing for them.
        const on = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={readOnly}
            onClick={() => onChange(m.value)}
            className="relative rounded-full px-3 py-1.5 text-[12.5px] transition-colors disabled:cursor-default"
            style={on ? { background: INK, color: "#fff" } : { color: INK, boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}
          >
            {/* 44px tall to the finger, same pill (7 Oct 2026, re-audit): 7px up
                and down inside the row's 8px padding, half the 8px gap sideways. */}
            <span aria-hidden="true" className="absolute -inset-y-[7px] -inset-x-1" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The card sheet's block under the header (7 Oct 2026, mock t05): the search
 * for a new start while the header's "change" is open, the caption once
 * ("Overland truck · 13h"), and the mode pills behind a quiet "Change how you
 * travel". The route is the title and the start is the header line, so the
 * From and To rows are gone.
 */
export default function TravelLegPanel({
  from, mode, modeLabel, durationMins, suggestion, fromOpen = false, onFromChange, onModeChange, readOnly = false, biasLat, biasLng,
}: {
  from: LegFrom | null;
  mode: LegMode | null;
  modeLabel?: string | null;
  durationMins: number | null;
  suggestion?: LegFrom | null;
  /** The header line's "change" is open: the search shows here. */
  fromOpen?: boolean;
  onFromChange: (from: LegFrom) => void;
  onModeChange: (mode: LegMode) => void;
  readOnly?: boolean;
  biasLat?: number | null;
  biasLng?: number | null;
}) {
  const [modesOpen, setModesOpen] = useState(false);
  const caption = [modeLabel, durationMins ? formatLegDuration(durationMins) : null].filter(Boolean).join(" · ");
  const searching = fromOpen && !readOnly;
  if (!searching && !from) return null;
  return (
    <div className="mb-4" data-testid="travel-leg-panel">
      {searching && <LegFromSearch value={from} suggestion={suggestion} onPick={onFromChange} biasLat={biasLat} biasLng={biasLng} />}
      {from && caption && (
        <p className="pt-1 text-[14px]" style={{ color: INK }} data-testid="leg-caption">{caption}</p>
      )}
      {from && !readOnly && (modesOpen ? (
        <LegModePicker value={mode} onChange={(m) => { onModeChange(m); setModesOpen(false); }} />
      ) : (
        <button
          type="button"
          onClick={() => setModesOpen(true)}
          className="relative mt-0.5 text-[12.5px] underline underline-offset-2"
          style={{ color: CAP }}
        >
          {/* 44px to the finger, one quiet line to the eye. */}
          <span aria-hidden="true" className="absolute -inset-y-[14px] inset-x-0" />
          Change how you travel
        </button>
      ))}
    </div>
  );
}
