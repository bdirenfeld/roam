"use client";

/**
 * The travel leg's controls (7 Oct 2026, mock d13 approved). One component
 * file, two hosts: the card sheet (From, To, mode, duration) and the
 * Add-to-this-day sheet (From and mode, before the leg is added). The rules
 * live in lib/travel/leg; this file is only the inputs.
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

/** The start of a leg: a row that reads "From  Lusaka"; a tap searches. */
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
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const token = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!editing || query.trim().length < 2) { setPredictions([]); return; }
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
  }, [query, editing, biasLat, biasLng]);

  const done = (from: LegFrom) => { onChange(from); setEditing(false); setQuery(""); setPredictions([]); };

  const pick = async (p: Prediction) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}&sessiontoken=${encodeURIComponent(token.current)}`);
      const data = await res.json();
      const r = data.result;
      const lat = r?.geometry?.location?.lat, lng = r?.geometry?.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        done({ title: r.name ?? p.structured_formatting.main_text, lat, lng, google_place_id: p.place_id });
      }
    } catch { /* stay in the search */ } finally {
      setBusy(false);
    }
  };

  const offer = suggestion && (!value || value.title !== suggestion.title) ? suggestion : null;

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
            className="text-left text-[14px] min-h-[28px] hover:underline"
            style={{ color: value ? INK : CAP }}
          >
            {value?.title ?? "Where you leave from"}
          </button>
        )}
      </div>
      {editing && !readOnly && (
        <div className="pt-2 pb-1">
          {offer && (
            <button
              type="button"
              onClick={() => done(offer)}
              className="w-full text-left py-2 text-[13px]"
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
      )}
    </div>
  );
}

/** Drive / Bus / Train / Ferry, one row of quiet pills. */
export function LegModePicker({ value, onChange, readOnly = false }: { value: LegMode | null; onChange: (m: LegMode) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2" role="radiogroup" aria-label="How you travel">
      {LEG_MODES.map((m) => {
        const on = (value ?? "drive") === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={readOnly}
            onClick={() => onChange(m.value)}
            className="rounded-full px-3 py-1.5 text-[12.5px] transition-colors disabled:cursor-default"
            style={on ? { background: INK, color: "#fff" } : { color: INK, boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** The card sheet's block: From (editable), To, how, and how long. */
export default function TravelLegPanel({
  from, to, mode, modeLabel, durationMins, suggestion, onFromChange, onModeChange, readOnly = false, biasLat, biasLng,
}: {
  from: LegFrom | null;
  to: string;
  mode: LegMode | null;
  modeLabel?: string | null;
  durationMins: number | null;
  suggestion?: LegFrom | null;
  onFromChange: (from: LegFrom) => void;
  onModeChange: (mode: LegMode) => void;
  readOnly?: boolean;
  biasLat?: number | null;
  biasLng?: number | null;
}) {
  return (
    <div className="mb-4" data-testid="travel-leg-panel">
      <LegFromField value={from} suggestion={suggestion} onChange={onFromChange} readOnly={readOnly} biasLat={biasLat} biasLng={biasLng} />
      <div className="flex items-baseline gap-3 py-2" style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}>
        <span className="w-12 shrink-0 text-[11px] uppercase" style={{ letterSpacing: "0.12em", color: CAP }}>To</span>
        <span className="text-[14px]" style={{ color: INK }}>{to}</span>
      </div>
      {(modeLabel || durationMins) && (
        <p className="pt-2 text-[12.5px]" style={{ color: CAP }}>
          {[modeLabel, durationMins ? formatLegDuration(durationMins) : null].filter(Boolean).join(" · ")}
        </p>
      )}
      <LegModePicker value={mode} onChange={onModeChange} readOnly={readOnly} />
    </div>
  );
}
