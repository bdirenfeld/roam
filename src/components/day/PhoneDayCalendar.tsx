"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { monthGrids, type CalDay } from "@/lib/week/tripCalendar";
import { journeyStays, STAY_LAYOUT_MIN_DAYS } from "@/lib/week/journeyStays";

/**
 * The phone's way to any day of the journey (27 Sep 2026). The date in the
 * Agenda header opens it — the same door as the dates in the desktop
 * masthead (TripCalendar). Before this the phone's only way across a 62-day
 * summer was the date strip, swipe after swipe; the "Day N of M" calendar
 * lived on the phone Plan board, which a phone has no door to.
 *
 * It drops from under the header (`top` is the header's measured bottom),
 * where the thumb already is, like the ··· menu. A dot marks a planned day;
 * a day with nothing on it is the paler tile. Two states, no key: a travel-day
 * arrow shipped the same day and was cut when Brennan asked what it meant.
 * The marks cost one small read, made only on open, and
 * fail quietly: without them it is still a calendar.
 *
 * A long journey (STAY_LAYOUT_MIN_DAYS or more) with two or more stays is
 * laid out by stay, not by month (27 Sep 2026): each stay's days under its
 * name. A short one is a plain calendar. The bar of stays that sat on top
 * said the headings twice and was cut the same day (Brennan: "overkill").
 * The stays come from the hotel cards the page already holds, so the layout
 * is right on the first frame; only the marks wait for the read.
 */
export default function PhoneDayCalendar({
  tripId, days, hotelCards, activeDayId, top, onSelect, onClose,
}: {
  tripId: string;
  days: Day[];
  /** The page's hotel cards (any status); only scheduled ones make a stay. */
  hotelCards: Card[];
  activeDayId: string;
  /** Viewport y of the header's bottom edge. */
  top: number;
  onSelect: (day: Day) => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const [planned, setPlanned] = useState<Set<string> | null>(null);
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
      .select("day_id")
      .eq("trip_id", tripId)
      .eq("status", "in_itinerary")
      .not("archived", "is", true)
      .not("day_id", "is", null)
      .then(({ data, error }) => {
        if (off) return;
        if (error) { console.error("PhoneDayCalendar marks:", error); return; }
        setPlanned(new Set((data ?? []).map((r) => r.day_id as string)));
      });
    return () => { off = true; };
  }, [tripId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const months = useMemo(() => monthGrids(days, planned ?? undefined), [days, planned]);
  const byId = useMemo(() => new Map(days.map((d) => [d.id, d])), [days]);
  const cellById = useMemo(() => {
    const m = new Map<string, CalDay>();
    for (const mo of months) for (const c of mo.weeks.flat()) if (c?.dayId) m.set(c.dayId, c);
    return m;
  }, [months]);
  // A saved idea can hold a day_id without being booked (Japan's saved pins
  // all hold day one); only a scheduled hotel card says where you sleep.
  const stays = useMemo(() => days.length < STAY_LAYOUT_MIN_DAYS ? null : journeyStays(
    days.map((d) => ({ id: d.id, dayNumber: d.day_number })),
    hotelCards
      .filter((c) => c.status === "in_itinerary" && c.day_id)
      .map((c) => ({ dayId: c.day_id, name: c.place?.title ?? null, address: c.place?.address ?? null })),
  ), [days, hotelCards]);
  const panelRef = useRef<HTMLDivElement>(null);
  const todayDay = todayStr ? days.find((d) => d.date === todayStr) ?? null : null;
  const pick = (d: Day) => { onClose(); onSelect(d); };
  const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const cell = (d: Day, c: CalDay | undefined) => {
    const on = d.id === activeDayId;
    const today = d.date === todayStr;
    const has = !!c?.planned;
    const quiet = planned !== null && !has;
    const what = has ? ", planned" : planned ? ", nothing planned" : "";
    return (
      <button
        key={d.id}
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
        <span className="leading-none">{+d.date.slice(8, 10)}</span>
        <span aria-hidden className="h-2 text-[9px] leading-[8px]">
          {has ? <span className="inline-block w-1 h-1 rounded-full bg-current align-middle" /> : null}
        </span>
      </button>
    );
  };
  const weekdays = (
    <div className="grid grid-cols-7 gap-[3px] text-[10px] mb-0.5" style={{ color: "rgba(26,26,46,0.45)" }}>
      {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i} className="text-center">{l}</span>)}
    </div>
  );

  return (
    <div className="md:hidden fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0" style={{ top, background: "rgba(26,26,46,0.18)" }} />
      <div
        ref={panelRef}
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
        {stays ? (
          <>
            {stays.map((s, i) => {
              const own = s.dayIds.map((id) => byId.get(id)).filter((d): d is Day => !!d);
              if (own.length === 0) return null;
              const first = own[0], last = own[own.length - 1];
              const lead = (new Date(first.date + "T00:00:00Z").getUTCDay() + 6) % 7;
              return (
                <section key={i} data-stay={i} className="mt-4">
                  <p className="text-[16px] font-medium text-activity leading-tight">
                    {s.label}
                    <span className="ml-2 text-[12px] font-normal" style={{ color: "rgba(26,26,46,0.62)" }}>
                      {shortDate(first.date)} – {shortDate(last.date)} · {own.length} {own.length === 1 ? "day" : "days"}
                    </span>
                  </p>
                  {s.hotel !== s.label && (
                    <p className="text-[12px] truncate mt-px" style={{ color: "rgba(26,26,46,0.62)" }}>{s.hotel}</p>
                  )}
                  <div className="mt-2">{weekdays}</div>
                  <div className="grid grid-cols-7 gap-[3px]">
                    {Array.from({ length: lead }, (_, k) => <span key={`b${k}`} />)}
                    {own.map((d) => cell(d, cellById.get(d.id)))}
                  </div>
                </section>
              );
            })}
          </>
        ) : months.map((m) => (
          <div key={m.key} className="mt-3">
            <p className="text-[13px] font-semibold text-activity mb-1.5">{m.label}</p>
            {weekdays}
            <div className="grid grid-cols-7 gap-[3px]">
              {m.weeks.flat().map((c, i) => {
                if (!c) return <span key={i} />;
                const d = c.dayId ? byId.get(c.dayId) : undefined;
                if (!d) {
                  return <span key={i} className="h-10 flex items-center justify-center text-[13px]" style={{ color: "rgba(26,26,46,0.25)" }}>{+c.date.slice(8, 10)}</span>;
                }
                return cell(d, c);
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
