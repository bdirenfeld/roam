"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Day } from "@/types/database";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { weeksOf } from "@/lib/week/repeat";

/**
 * "Repeat on…" (27 Sep 2026): Copy, but to as many days as you tick. A kids'
 * day camp is the same card every weekday for weeks; one Copy per day was
 * about sixty taps for three weeks. Days are grouped Monday to Sunday, each
 * week with a Mon–Fri shortcut. The copies are ordinary cards — skipping a
 * day is deleting that one — and the caller undoes them all at once.
 */
export default function RepeatDaysOverlay({
  days,
  currentDayId = null,
  onConfirm,
  onClose,
}: {
  days: Day[];
  currentDayId?: string | null;
  onConfirm: (days: Day[]) => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const weeks = useMemo(() => weeksOf(days), [days]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const can = (d: Day) => d.id !== currentDayId;
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleWeekdays = (ds: Day[]) => setPicked((prev) => {
    const n = new Set(prev);
    const open = ds.filter(can);
    const all = open.every((d) => n.has(d.id));
    for (const d of open) { if (all) n.delete(d.id); else n.add(d.id); }
    return n;
  });
  const chosen = days.filter((d) => picked.has(d.id));
  // Open at the card's own week, not the journey's first: a camp in August
  // on a summer from July sat six weeks down the list.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const here = currentDayId ? listRef.current?.querySelector<HTMLElement>(`[data-week-has="${currentDayId}"]`) : null;
    if (here && listRef.current) listRef.current.scrollTop = here.offsetTop - listRef.current.offsetTop;
  }, [currentDayId]);
  const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Date(date + "T00:00:00").toLocaleDateString("en-GB", o);

  return (
    // z-30: above the card's photo arrows (z-22), which showed through.
    <div className="absolute inset-0 z-30 bg-white rounded-t-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-[16px] font-bold text-gray-900">Repeat on</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div ref={listRef} className="overflow-y-auto flex-1">
        {weeks.map((w) => {
          const open = w.weekdays.filter(can);
          const allOn = open.length > 0 && open.every((d) => picked.has(d.id));
          return (
            <div key={w.monday} className="border-b border-gray-100" data-week-has={w.days.some((d) => d.id === currentDayId) ? currentDayId ?? undefined : undefined}>
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <span className="text-[11px] uppercase tracking-widest text-gray-400">Week of {fmt(w.monday, { day: "numeric", month: "short" })}</span>
                {open.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleWeekdays(w.weekdays)}
                    aria-pressed={allOn}
                    className={`h-7 px-3 rounded-full text-[12px] font-medium transition-colors ${allOn ? "bg-[#1A1A2E] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    Mon–Fri
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                {w.days.map((d) => {
                  const on = picked.has(d.id);
                  const disabled = !can(d);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(d.id)}
                      aria-pressed={on}
                      title={disabled ? "It is already on this day" : undefined}
                      className={`min-w-[52px] h-11 px-2 rounded-xl text-[12.5px] leading-tight transition-colors ${disabled ? "opacity-35 cursor-default bg-gray-50 text-gray-500" : on ? "bg-activity text-white" : "bg-gray-50 text-gray-800 hover:bg-gray-100"}`}
                    >
                      <span className="block font-semibold">{fmt(d.date, { weekday: "short" })}</span>
                      <span className="block">{fmt(d.date, { day: "numeric", month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onConfirm(chosen)}
          className="w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-[#1A1A2E] disabled:opacity-30 transition-opacity"
        >
          {chosen.length === 0 ? "Pick the days" : `Copy to ${chosen.length} ${chosen.length === 1 ? "day" : "days"}`}
        </button>
      </div>
    </div>
  );
}
