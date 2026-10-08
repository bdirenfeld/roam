"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { NESTED_SHEET_ATTR } from "@/components/ui/Overlay";
import PartyPicker from "@/components/trip/PartyPicker";
import { agesFrom, partyFrom, partySize, type Party } from "@/lib/party";
import { localDate } from "@/lib/isSameLocalDay";
import { agesOn, copiedMessage, copyCaption, endFor, isSavedPlace, journeyLength, longDay, suggestStart, weekdayOf } from "@/lib/trips/copyJourney";

/**
 * Copy to new dates (7 Oct 2026, mock t07 approved). Opened from a past
 * journey's ⋯, an upcoming journey card's ⋯, and Journey settings — owner
 * only; every host checks that before rendering it, and the route checks it
 * again. Name, a start date (the end follows, same length), who is going, and
 * whether the saved places come too. One primary: "Copy trip".
 */

export interface CopySource {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  party_size: number | null;
  party_ages: number[] | null;
}

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const RULE = "rgba(26,26,46,0.12)";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthCells(year: number, month: number): Array<string | null> {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first }, () => null);
  for (let d = 1; d <= count; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return cells;
}

export default function CopyJourneySheet({ trip, onClose, onCopied, today }: {
  trip: CopySource;
  onClose: () => void;
  /** After a copy, before going to it: an overlay host (Journey settings) closes itself here. */
  onCopied?: () => void;
  /** The phone harness and tests pin "today"; the app uses the reader's local date. */
  today?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  useEscapeKey(onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(onClose, bodyRef);

  const length = journeyLength(trip.start_date, trip.end_date);
  const [start, setStart] = useState(() => suggestStart(trip.start_date, today ?? localDate(new Date())));
  const [title, setTitle] = useState(trip.title);
  // Everyone a year older when the copy is a year on (agesOn).
  const [party, setParty] = useState<Party>(() => partyFrom(trip.party_size, agesOn(trip.party_ages, trip.start_date, start)));
  const [saved, setSaved] = useState<number | null>(null);
  const [bringSaved, setBringSaved] = useState(true);
  const [calOpen, setCalOpen] = useState(false);
  const [cal, setCal] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const [saving, setSaving] = useState(false);

  // How many saved places the switch would bring: one small read on open.
  useEffect(() => {
    let off = false;
    createClient().from("cards").select("id, status, archived, place_id").eq("trip_id", trip.id).in("status", ["interested", "on_map"])
      .then(({ data }) => { if (!off) setSaved((data ?? []).filter((c) => isSavedPlace(c as { status: string; archived: boolean | null; place_id: string | null })).length); });
    return () => { off = true; };
  }, [trip.id]);

  const end = endFor(start, length);
  const cells = useMemo(() => monthCells(cal.y, cal.m), [cal]);
  const stepMonth = (by: number) => setCal(({ y, m }) => { const t = m + by; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; });
  const pick = (d: string) => { setStart(d); setCalOpen(false); };

  const copy = async () => {
    if (saving || !title.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/trips/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: trip.id, title: title.trim(), startDate: start,
          partySize: partySize(party), partyAges: agesFrom(party, agesOn(trip.party_ages, trip.start_date, start)),
          includeSaved: bringSaved && (saved ?? 0) > 0,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { tripId?: string; firstDayId?: string | null; counts?: { days: number; places: number }; error?: string };
      if (!r.ok || !j.tripId) {
        setSaving(false);
        toast({ message: j.error ?? "Couldn't copy this journey. Try again." });
        return;
      }
      onClose();
      onCopied?.();
      // Day 1 of the new journey, where the placeholders are.
      router.push(j.firstDayId ? `/trips/${j.tripId}/days/${j.firstDayId}` : `/trips/${j.tripId}`);
      toast({ message: copiedMessage(j.counts ?? { days: length, places: 0 }) });
    } catch {
      setSaving(false);
      toast({ message: "Couldn't copy this journey. Check your connection and try again." });
    }
  };

  const label = "block text-[10px] uppercase tracking-widest mb-1.5";

  return (
    <div {...NESTED_SHEET_ATTR} className="fixed inset-0 z-[90] flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="copy-journey-sheet">
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        role="dialog"
        aria-label={`Copy ${trip.title}`}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-3 pb-3 flex-shrink-0">
          {/* One line, cut with … when the name is long (his ask on the mock). */}
          <h3 className="flex-1 min-w-0 truncate font-display italic text-[19px]" style={{ color: INK }}>Copy {trip.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="relative w-7 h-7 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <span aria-hidden="true" className="absolute -inset-2" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-2">
          <label className={label} style={{ color: CAPTION }} htmlFor="copy-name">Name</label>
          <input
            id="copy-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-11 rounded-xl px-3.5 text-[15px] outline-none focus:ring-1 focus:ring-[#1A1A2E]/30"
            style={{ color: INK, border: `1px solid ${RULE}` }}
          />

          <p className={`${label} mt-4`} style={{ color: CAPTION }}>Start date</p>
          <div className="rounded-xl" style={{ border: `1px solid ${RULE}` }}>
            <button
              type="button"
              onClick={() => { setCal({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }); setCalOpen((v) => !v); }}
              aria-expanded={calOpen}
              className="w-full h-11 flex items-center justify-between px-3.5 text-left"
              data-testid="copy-start"
            >
              <span className="text-[15px]" style={{ color: INK }}>{longDay(start)}</span>
              <svg width="12" height="12" viewBox="0 0 256 256" fill={CAPTION} aria-hidden style={{ transform: calOpen ? "rotate(180deg)" : undefined }}>
                <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
              </svg>
            </button>
            {calOpen && (
              <div className="px-2 pb-2" data-testid="copy-calendar">
                <div className="flex items-center justify-between mb-1">
                  <button type="button" onClick={() => stepMonth(-1)} className="w-11 h-11 flex items-center justify-center text-gray-400" aria-label="Previous month">‹</button>
                  <span className="text-[13px] font-semibold" style={{ color: INK }}>{MONTHS[cal.m]} {cal.y}</span>
                  <button type="button" onClick={() => stepMonth(1)} className="w-11 h-11 flex items-center justify-center text-gray-400" aria-label="Next month">›</button>
                </div>
                <div className="grid grid-cols-7">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="h-6 flex items-center justify-center text-[9px] uppercase text-gray-400">{d}</div>)}
                  {cells.map((d, i) => d ? (
                    <div key={d} className={`h-11 flex items-center justify-center ${d > start && d <= end ? "bg-[#1A1A2E]/10" : ""}`}>
                      <button
                        type="button"
                        onClick={() => pick(d)}
                        aria-label={longDay(d)}
                        aria-pressed={d === start}
                        className={`relative w-10 h-10 rounded-md text-[13px] ${d === start ? "bg-[#1A1A2E] text-white" : "text-gray-800 hover:bg-gray-100"}`}
                      >
                        {/* 44px to the finger: the 44px cell, drawn as a 40px square. */}
                        <span aria-hidden="true" className="absolute -inset-0.5" />
                        {Number(d.slice(8))}
                      </button>
                    </div>
                  ) : <div key={`e${i}`} className="h-11" />)}
                </div>
              </div>
            )}
            <div className="px-3.5 pb-2.5 -mt-0.5">
              <p className="text-[12px]" style={{ color: CAPTION }}>Last time you started on a {weekdayOf(trip.start_date)}</p>
              <p className="text-[12.5px] font-medium mt-0.5" style={{ color: INK }} data-testid="copy-caption">{copyCaption(start, length)}</p>
            </div>
          </div>

          <div className="mt-3 -mx-5">
            <PartyPicker party={party} onChange={setParty} labelClass="text-[rgba(26,26,46,0.62)]" />
          </div>

          {(saved ?? 0) > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={bringSaved}
              onClick={() => setBringSaved((v) => !v)}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 py-2 text-left"
              style={{ borderBottom: `1px solid ${RULE}` }}
            >
              <span className="text-[14px]" style={{ color: INK }}>Bring the {saved} {saved === 1 ? "place" : "places"} saved on the map</span>
              <span aria-hidden className="relative inline-block w-[38px] h-[22px] flex-shrink-0 rounded-full transition-colors" style={{ backgroundColor: bringSaved ? INK : "#D1D5DB" }}>
                <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: bringSaved ? 19 : 3 }} />
              </span>
            </button>
          )}

          <p className="text-[12.5px] leading-relaxed mt-3" style={{ color: CAPTION }}>
            Copies every day, place, time and note. Flights and stays come back as placeholders to book.
          </p>
        </div>

        <div className="flex-shrink-0 px-5 pt-3 pb-8">
          <button
            type="button"
            onClick={copy}
            disabled={saving || !title.trim()}
            className="w-full py-3.5 rounded-full bg-[#1A1A2E] text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {saving ? "Copying…" : "Copy trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
