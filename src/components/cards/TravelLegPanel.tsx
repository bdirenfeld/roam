"use client";

/**
 * The travel leg's controls (7 Oct 2026, mock d13 approved; slimmed the same
 * day, mock t05). One component file, two hosts: the card sheet (the quiet
 * "From Lusaka · change" line under the route, the caption, the mode pills
 * behind "Change how you travel") and the Add-to-this-day sheet (From, then
 * the mode once From is set). The rules live in lib/travel/leg; this file is
 * only the inputs.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
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
          .select("id, day_id, place_id, status, start_time, details, place:places ( id, title, sub_type, lat, lng, google_place_id, address )")
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
        onPick({ title: r.name ?? p.structured_formatting.main_text, lat, lng, google_place_id: p.place_id, ...(r.formatted_address ? { address: r.formatted_address } : {}) });
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
  toOpen = false, onToPick, estimate, merged = false, time,
}: {
  /** The simpler card (14 Nov 2026, mock D): the estimate pills are the mode;
   *  no caption, and "Other ways" opens the four modes. */
  merged?: boolean;
  /** The card's time, first in the body on the simpler card. */
  time?: ReactNode;
  /** The To row's "change" is open: a place search shows here (12 Nov 2026). */
  toOpen?: boolean;
  onToPick?: (to: LegFrom) => void;
  /** The car / transit times row, under the caption. */
  estimate?: ReactNode;
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
  const searchingTo = toOpen && !readOnly && !!onToPick;
  if (!searching && !searchingTo && !from) return null;
  // One line, "🚗 Drive · 1 h · change" (12 Nov 2026): the mode's own "change"
  // replaced the separate "Change how you travel" link under the caption.
  const glyph = mode === "train" ? "train" : mode === "bus" ? "directions_bus" : mode === "ferry" ? "directions_boat" : mode === "drive" ? "directions_car" : null;
  return (
    <div className="mb-4" data-testid="travel-leg-panel">
      {searching && <LegFromSearch value={from} suggestion={suggestion} onPick={onFromChange} biasLat={biasLat} biasLng={biasLng} />}
      {searchingTo && <LegFromSearch value={null} onPick={onToPick!} biasLat={biasLat} biasLng={biasLng} />}
      {from && time && <div className="pt-1 pb-1" data-testid="leg-time">{time}</div>}
      {from && (caption || !readOnly) && !merged && (
        <p className="pt-1 text-[14px] flex items-center gap-1.5" style={{ color: INK }} data-testid="leg-caption">
          {glyph && <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">{glyph}</span>}
          <span>{caption || "How you travel"}</span>
          {!readOnly && !modesOpen && (
            <button
              type="button"
              onClick={() => setModesOpen(true)}
              aria-label="Change how you travel"
              className="relative ml-1 text-[12.5px] underline underline-offset-2"
              style={{ color: CAP }}
            >
              {/* 44px to the finger, one quiet word to the eye. */}
              <span aria-hidden="true" className="absolute -inset-y-[14px] -inset-x-2" />
              change
            </button>
          )}
        </p>
      )}
      {from && !readOnly && modesOpen && (
        <LegModePicker value={mode} onChange={(m) => { onModeChange(m); setModesOpen(false); }} />
      )}
      {from && !merged && estimate}
      {from && merged && (
        <div className="flex flex-wrap items-end gap-x-3">
          {estimate}
          {!readOnly && !modesOpen && (
            <button
              type="button"
              onClick={() => setModesOpen(true)}
              aria-label="Change how you travel"
              className="relative text-[12.5px] underline underline-offset-2 pb-1.5"
              style={{ color: CAP }}
            >
              {/* 44px to the finger, one quiet line to the eye. */}
              <span aria-hidden="true" className="absolute -inset-y-[10px] -inset-x-2" />
              Other ways
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * From and To, each with its address and its own "change" (Brennan, 12 Nov
 * 2026: "it feels weird without that"). Two dots joined by a dotted line, the
 * same mark the map draws. It replaces the one-line "From Lusaka · change"
 * and the bare address under the title. The To address is still the sheet's
 * door to directions.
 */
export function LegRoute({
  from, fromAddress, toTitle, toAddress, readOnly = false, open, onOpen, onDirections, prominent = false,
}: {
  /** The simpler card (14 Nov 2026, mock D): the rows are the top of the card,
   *  a size up, no From / To labels; a tap on the name changes that end (the
   *  › says so), and the To address stays the door to directions. */
  prominent?: boolean;
  from: LegFrom | null;
  fromAddress?: string | null;
  toTitle: string;
  toAddress?: string | null;
  readOnly?: boolean;
  open: "from" | "to" | null;
  onOpen: (which: "from" | "to" | null) => void;
  onDirections?: () => void;
}) {
  const label = (which: "from" | "to") => which === "from" ? (from ? `Change where this starts, now ${from.title}` : "Set where this starts") : `Change where this goes, now ${toTitle}`;
  const big = (which: "from" | "to", title: string | null, address: string | null | undefined) => (
    <div className="flex items-start gap-2.5" data-testid={`leg-${which}-row`}>
      <span
        aria-hidden="true"
        className="mt-[9px] w-[9px] h-[9px] rounded-full flex-shrink-0"
        style={which === "from" ? { border: `2px solid ${INK}`, background: "#fff" } : { background: INK }}
      />
      <div className="flex-1 min-w-0">
        {readOnly ? (
          <div className="text-[18px] font-bold leading-snug truncate" style={{ color: title ? INK : CAP }}>{title ?? "Where you leave from"}</div>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(open === which ? null : which)}
            aria-expanded={open === which}
            aria-label={label(which)}
            className="relative w-full flex items-center gap-2 text-left"
          >
            <span aria-hidden="true" className={`absolute inset-x-0 ${which === "from" ? "-top-[12px] -bottom-[7px]" : "-top-[19px] bottom-0"}`} />
            <span className="flex-1 min-w-0 text-[18px] font-bold leading-snug truncate" style={{ color: title ? INK : CAP }}>{title ?? "Add where you leave from"}</span>
            <svg className="flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.4)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
          </button>
        )}
        {address && (which === "to" && onDirections ? (
          <button type="button" onClick={onDirections} title="Directions" aria-label={`Directions to ${address}`}
            className="relative block text-left text-[12px] leading-snug hover:underline truncate max-w-full" style={{ color: "rgba(26,26,46,0.55)" }}>
            <span aria-hidden="true" className="absolute -top-1 -bottom-[23px] inset-x-0" />
            {address}
          </button>
        ) : (
          <div className="text-[12px] leading-snug truncate" style={{ color: "rgba(26,26,46,0.55)" }}>{address}</div>
        ))}
      </div>
    </div>
  );
  if (prominent) {
    return (
      <div className="relative mt-1 flex flex-col gap-3.5" data-testid="leg-route">
        <span aria-hidden="true" className="absolute left-[3.5px] top-[20px] h-[44px]" style={{ borderLeft: "2px dotted rgba(26,26,46,0.3)" }} />
        {big("from", from?.title ?? null, fromAddress ?? from?.address ?? null)}
        {big("to", toTitle, toAddress)}
      </div>
    );
  }
  const row = (which: "from" | "to", title: string | null, address: string | null | undefined) => (
    <div className="flex items-start gap-2.5" data-testid={`leg-${which}-row`}>
      <span
        aria-hidden="true"
        className="mt-[19px] w-[9px] h-[9px] rounded-full flex-shrink-0"
        style={which === "from" ? { border: `2px solid ${INK}`, background: "#fff" } : { background: INK }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] uppercase" style={{ letterSpacing: "0.1em", color: "rgba(26,26,46,0.5)" }}>{which === "from" ? "From" : "To"}</div>
        <div className="text-[14px] font-medium leading-snug truncate" style={{ color: title ? INK : CAP }}>{title ?? "Where you leave from"}</div>
        {address && (which === "to" && onDirections ? (
          <button type="button" onClick={onDirections} title="Directions" aria-label={`Directions to ${address}`}
            className="relative block text-left text-[12px] leading-snug hover:underline truncate max-w-full" style={{ color: "rgba(26,26,46,0.55)" }}>
            <span aria-hidden="true" className="absolute -inset-y-[14px] inset-x-0" />
            {address}
          </button>
        ) : (
          <div className="text-[12px] leading-snug truncate" style={{ color: "rgba(26,26,46,0.55)" }}>{address}</div>
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onOpen(open === which ? null : which)}
          aria-expanded={open === which}
          aria-label={which === "from" ? (from ? `Change where this starts, now ${from.title}` : "Set where this starts") : `Change where this goes, now ${toTitle}`}
          className="relative mt-[17px] text-[12px] underline underline-offset-2 flex-shrink-0"
          style={{ color: "rgba(26,26,46,0.5)" }}
        >
          <span aria-hidden="true" className="absolute -inset-y-[14px] -inset-x-2" />
          {which === "from" && !from ? "add" : "change"}
        </button>
      )}
    </div>
  );
  return (
    <div className="relative mt-3 flex flex-col gap-2.5" data-testid="leg-route">
      <span aria-hidden="true" className="absolute left-[3.5px] top-[30px] h-[38px]" style={{ borderLeft: "2px dotted rgba(26,26,46,0.3)" }} />
      {row("from", from?.title ?? null, fromAddress ?? from?.address ?? null)}
      {row("to", toTitle, toAddress)}
    </div>
  );
}

/**
 * Car and transit times side by side, "🚗 55 min   🚆 1 h 40 · 1 change"
 * (12 Nov 2026). The way the card is set to now is filled; a tap on the
 * other sets that mode and moves the end time to fit.
 */
export function LegEstimateRow({
  drive, transit, via, rides, mode, readOnly = false, onUse,
}: {
  drive: number | null;
  transit: number | null;
  via: LegMode | null;
  rides: number | null;
  mode: LegMode | null;
  readOnly?: boolean;
  onUse: (mode: LegMode, mins: number) => void;
}) {
  if (drive == null && transit == null) return null;
  const pill = (m: LegMode, mins: number, icon: string, extra: string) => {
    const on = mode === m;
    return (
      <button
        key={m}
        type="button"
        disabled={readOnly}
        onClick={() => onUse(m, mins)}
        aria-pressed={on}
        className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] disabled:cursor-default"
        style={on ? { background: INK, color: "#fff" } : { color: INK, boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}
      >
        <span aria-hidden="true" className="absolute -inset-y-[7px] -inset-x-1" />
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden="true">{icon}</span>
        {fmtMins(mins)}{extra ? <span style={{ opacity: 0.7 }}>· {extra}</span> : null}
      </button>
    );
  };
  const changes = rides && rides > 1 ? (rides - 1 === 1 ? "1 change" : `${rides - 1} changes`) : "";
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2" data-testid="leg-estimate">
      {drive != null && pill("drive", drive, "directions_car", "")}
      {transit != null && pill(via ?? "train", transit, via === "bus" ? "directions_bus" : via === "ferry" ? "directions_boat" : "train", changes)}
    </div>
  );
}

// Rounded to five minutes, like the end time a tap sets: "1 h 05", not "1 h 3".
function fmtMins(raw: number): string {
  const m = Math.max(5, Math.round(raw / 5) * 5);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r < 10 ? "0" : ""}${r}` : `${h} h`;
}
