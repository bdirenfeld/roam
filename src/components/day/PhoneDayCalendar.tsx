"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { dayMarks, monthGrids } from "@/lib/week/tripCalendar";

/**
 * The phone's way to any day of the journey (27 Sep 2026). The date in the
 * Agenda header opens it — the same door as the dates in the desktop
 * masthead (TripCalendar). Before this the phone's only way across a 62-day
 * summer was the date strip, swipe after swipe; the "Day N of M" calendar
 * lived on the phone Plan board, which a phone has no door to.
 *
 * It drops from under the header (`top` is the header's measured bottom),
 * where the thumb already is, like the ··· menu. A dot marks a planned day,
 * an arrow a travel day (flight, train, check-in); a day with nothing on it
 * is the paler tile. The marks cost one small read, made only on open, and
 * fail quietly: without them it is still a calendar.
 */
export default function PhoneDayCalendar({
  tripId, days, activeDayId, top, onSelect, onClose,
}: {
  tripId: string;
  days: Day[];
  activeDayId: string;
  /** Viewport y of the header's bottom edge. */
  top: number;
  onSelect: (day: Day) => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const [marks, setMarks] = useState<{ planned: Set<string>; travel: Set<string> } | null>(null);
  // Today is decided in the browser, after mount (a server in UTC calls it
  // tomorrow from 8pm Eastern).
  const [todayStr, setTodayStr] = useState<string | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const n = new Date();
    setTodayStr(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`);
  }, []);

  useEffect(() => {
    let off = false;
    createClient()
      .from("cards")
      .select("day_id, place:places(sub_type)")
      .eq("trip_id", tripId)
      .eq("status", "in_itinerary")
      .not("archived", "is", true)
      .not("day_id", "is", null)
      .then(({ data, error }) => {
        if (off) return;
        if (error) { console.error("PhoneDayCalendar marks:", error); return; }
        const rows = (data ?? []) as unknown as { day_id: string | null; place: { sub_type: string | null } | null }[];
        setMarks(dayMarks(rows.map((r) => ({ day_id: r.day_id, sub_type: r.place?.sub_type ?? null }))));
      });
    return () => { off = true; };
  }, [tripId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const months = useMemo(() => monthGrids(days, marks?.planned, marks?.travel), [days, marks]);
  const byId = useMemo(() => new Map(days.map((d) => [d.id, d])), [days]);
  const todayDay = todayStr ? days.find((d) => d.date === todayStr) ?? null : null;
  const pick = (d: Day) => { onClose(); onSelect(d); };

  return (
    <div className="md:hidden fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0" style={{ top, background: "rgba(26,26,46,0.18)" }} />
      <div
        role="dialog"
        aria-label="Jump to a day"
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bg-white overflow-y-auto overscroll-y-contain px-4 pt-3 pb-4"
        style={{
          top,
          maxHeight: `calc(100dvh - ${top}px - 48px)`,
          borderBottom: "1px solid rgba(26,26,46,0.10)",
          boxShadow: "0 16px 34px rgba(26,26,46,0.17)",
        }}
      >
        {todayDay && todayDay.id !== activeDayId && (
          <button
            type="button"
            onClick={() => pick(todayDay)}
            className="w-full mb-1 py-2.5 rounded-full text-[13px] font-medium text-white bg-[#1A1A2E]"
          >
            Jump to today
          </button>
        )}
        {months.map((m) => (
          <div key={m.key} className="mt-3">
            <p className="text-[13px] font-semibold text-activity mb-1.5">{m.label}</p>
            <div className="grid grid-cols-7 gap-[3px] text-[10px] mb-0.5" style={{ color: "rgba(26,26,46,0.45)" }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i} className="text-center">{l}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-[3px]">
              {m.weeks.flat().map((c, i) => {
                if (!c) return <span key={i} />;
                const n = +c.date.slice(8, 10);
                const d = c.dayId ? byId.get(c.dayId) : undefined;
                if (!d) {
                  return <span key={i} className="h-10 flex items-center justify-center text-[13px]" style={{ color: "rgba(26,26,46,0.25)" }}>{n}</span>;
                }
                const on = d.id === activeDayId;
                const today = d.date === todayStr;
                const quiet = marks !== null && !c.planned;
                const what = c.travel ? ", travel day" : c.planned ? ", planned" : marks ? ", nothing planned" : "";
                return (
                  <button
                    key={i}
                    ref={on ? activeRef : null}
                    type="button"
                    onClick={() => pick(d)}
                    aria-current={on ? "date" : undefined}
                    aria-label={`${new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${what}`}
                    className="h-10 rounded-[10px] flex flex-col items-center justify-center gap-[2px] text-[14px] font-medium"
                    style={{
                      background: on ? "#1A1A2E" : quiet ? "#F8F6F0" : "#F3EFE4",
                      color: on ? "#fff" : quiet ? "rgba(26,26,46,0.62)" : "#1A1A2E",
                      boxShadow: today && !on ? "inset 0 0 0 1.5px #D18A2E" : "none",
                    }}
                  >
                    <span className="leading-none">{n}</span>
                    <span aria-hidden className="h-2 text-[9px] leading-[8px]">
                      {c.travel ? "→" : c.planned ? <span className="inline-block w-1 h-1 rounded-full bg-current align-middle" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px]" style={{ color: "rgba(26,26,46,0.62)" }}>
          <span>• planned</span>
          <span>→ travel day</span>
          {todayDay && <span><span className="inline-block w-2.5 h-2.5 rounded-[3px] align-[-1px] mr-1" style={{ boxShadow: "inset 0 0 0 1.5px #D18A2E" }} />today</span>}
        </div>
      </div>
    </div>
  );
}
