"use client";

import { useState } from "react";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { calendarGrid } from "@/lib/calendarGrid";
import { tapDay, nightsOf, selectable, type StayPick } from "@/lib/stays/stayPick";
import { parseTypedTime } from "@/components/day/TimeSheet";
import { formatTimeValue } from "@/lib/formatTime";

/**
 * The hotel picker (17 Nov 2026, Brennan approved the mock "the way hotel apps
 * do it"): one calendar. Tap the check-in day, then the check-out day; the
 * nights between fill in. It opens on the journey and only journey days can be
 * picked. A dot marks a night another hotel covers. Check in / Check out times
 * sit at the bottom as boxes you type in. An uploaded confirmation overwrites
 * all of this later, which is fine (his words).
 */

const INK = "#1A1A2E";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed 25 Aug": months spelled by hand (ICU writes "Sept" in some places and not others). */
export function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DOW[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

export interface StayDatesValue { checkIn: string; checkOut: string | null; start: string | null; end: string | null }

export default function StayDatesSheet({ title, tripStart, tripEnd, initial, otherNights, onSave, onClose }: {
  title: string;
  tripStart: string;
  tripEnd: string;
  initial: StayDatesValue;
  /** Night date → the other hotel's name. */
  otherNights: Record<string, string>;
  onSave: (v: StayDatesValue) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<StayPick>({ checkIn: initial.checkIn, checkOut: initial.checkOut });
  const first = new Date((initial.checkIn || tripStart) + "T00:00:00");
  const [ym, setYm] = useState({ y: first.getFullYear(), m: first.getMonth() });
  const [startText, setStartText] = useState(initial.start ? formatTimeValue(initial.start) : "");
  const [endText, setEndText] = useState(initial.end ? formatTimeValue(initial.end) : "");
  const drag = useSheetDrag(onClose);
  useEscapeKey(onClose, true);

  const cells = calendarGrid(ym.y, ym.m);
  const nights = nightsOf(pick);
  const others = Array.from(new Set(Object.values(otherNights)));
  // One line however many hotels the journey has (17 Nov 2026: "if you have
  // like 5 hotels will the design break"): the name when there is one other.
  const legend = others.length === 1 ? `${others[0]} that night` : "Another hotel that night";
  const shownHasOther = cells.some((c) => c && otherNights[c]);
  const step = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const startTime = parseTypedTime(startText);
  const endTime = parseTypedTime(endText);
  const badStart = startText.trim() !== "" && !startTime;
  const badEnd = endText.trim() !== "" && !endTime;

  const done = () => {
    if (!pick.checkIn) { onClose(); return; }
    onSave({ checkIn: pick.checkIn, checkOut: pick.checkOut, start: startTime, end: endTime });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-end md:items-center md:justify-center" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="stay-dates">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart} onTouchMove={drag.onTouchMove} onTouchEnd={drag.onTouchEnd} onTouchCancel={drag.onTouchCancel}
        role="dialog" aria-label={`${title}: dates`}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl md:rounded-2xl shadow-sheet px-5"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-center pt-2.5"><div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} /></div>
        <p className="text-center text-[18px] font-medium mt-3 truncate" style={{ color: INK }}>{title}</p>
        <p className="text-center text-[14px] mt-0.5 mb-4" data-testid="stay-summary" style={{ color: "rgba(26,26,46,0.62)" }}>
          {pick.checkIn ? (
            <>
              <b className="font-semibold" style={{ color: INK }}>{dayLabel(pick.checkIn)} → {pick.checkOut ? dayLabel(pick.checkOut) : "…"}</b>
              {nights > 0 ? ` · ${nights} ${nights === 1 ? "night" : "nights"}` : " · pick the day you leave"}
            </>
          ) : "Pick the day you arrive"}
        </p>

        <div className="flex items-center justify-between px-1 mb-2">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="w-11 h-11 flex items-center justify-center text-[18px]" style={{ color: "rgba(26,26,46,0.55)" }}>‹</button>
          <span className="text-[16px] font-medium" style={{ color: INK }}>{MONTHS[ym.m]} {ym.y}</span>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className="w-11 h-11 flex items-center justify-center text-[18px]" style={{ color: "rgba(26,26,46,0.55)" }}>›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] pb-1.5" style={{ color: "rgba(26,26,46,0.5)" }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`e-${i}`} className="h-[42px]" />;
            const ok = selectable(iso, tripStart, tripEnd);
            const isIn = iso === pick.checkIn, isOut = iso === pick.checkOut;
            const between = !!(pick.checkIn && pick.checkOut && iso > pick.checkIn && iso < pick.checkOut);
            const col = i % 7;
            const band = between || ((isIn && pick.checkOut) ? "in" : null) || (isOut ? "out" : null);
            const bg = between ? "#F0EFEB"
              : isIn && pick.checkOut && col !== 6 ? "linear-gradient(90deg, transparent 50%, #F0EFEB 50%)"
              : isOut && col !== 0 ? "linear-gradient(90deg, #F0EFEB 50%, transparent 50%)" : "transparent";
            const radius = between && col === 0 ? "21px 0 0 21px" : between && col === 6 ? "0 21px 21px 0" : undefined;
            const other = otherNights[iso];
            return (
              <button
                key={iso}
                type="button"
                disabled={!ok}
                onClick={() => setPick((p) => tapDay(p, iso))}
                aria-label={`${dayLabel(iso)}${isIn ? ", check in" : isOut ? ", check out" : ""}${other ? `, ${other} that night` : ""}`}
                aria-pressed={isIn || isOut}
                data-band={band ? "1" : undefined}
                className="relative h-[42px] flex flex-col items-center justify-center text-[15px]"
                style={{ background: bg, borderRadius: radius, color: ok ? INK : "rgba(26,26,46,0.28)" }}
              >
                {(isIn || isOut) && <span aria-hidden="true" className="absolute w-[38px] h-[38px] rounded-full" style={{ background: INK }} />}
                <span className="relative" style={{ color: isIn || isOut ? "#fff" : undefined, fontWeight: isIn || isOut ? 600 : 400 }}>{Number(iso.slice(8))}</span>
                {other && !isIn && !isOut && <span aria-hidden="true" data-other-night="1" className="relative w-[5px] h-[5px] rounded-full mt-0.5" style={{ background: "rgba(26,26,46,0.4)" }} />}
              </button>
            );
          })}
        </div>
        {/* Reserve the line so the times below never jump between months. */}
        <p className="text-center text-[12px] mt-1.5 h-[18px] truncate" data-testid="stay-legend" style={{ color: "rgba(26,26,46,0.55)" }}>
          {shownHasOther && <><span aria-hidden="true" className="inline-block w-[6px] h-[6px] rounded-full mr-1.5 align-middle" style={{ background: "rgba(26,26,46,0.4)" }} />{legend}</>}
        </p>

        <div className="flex items-center justify-between gap-3 mt-3 pt-3.5" style={{ borderTop: "1px solid rgba(26,26,46,0.08)" }}>
          <label className="flex items-center gap-2 text-[13.5px]" style={{ color: "rgba(26,26,46,0.62)" }}>
            Check in
            <input value={startText} onChange={(e) => setStartText(e.target.value)} onBlur={() => startTime && setStartText(formatTimeValue(startTime))}
              placeholder="3:00 PM" aria-label="Check-in time" inputMode="text"
              className="w-[96px] h-[38px] rounded-[10px] px-2.5 text-[15px] text-center outline-none"
              style={{ color: INK, border: `1.5px solid ${badStart ? "#B0541F" : "rgba(26,26,46,0.16)"}` }} />
          </label>
          <label className="flex items-center gap-2 text-[13.5px]" style={{ color: "rgba(26,26,46,0.62)" }}>
            Check out
            <input value={endText} onChange={(e) => setEndText(e.target.value)} onBlur={() => endTime && setEndText(formatTimeValue(endTime))}
              placeholder="11:00 AM" aria-label="Check-out time" inputMode="text"
              className="w-[96px] h-[38px] rounded-[10px] px-2.5 text-[15px] text-center outline-none"
              style={{ color: INK, border: `1.5px solid ${badEnd ? "#B0541F" : "rgba(26,26,46,0.16)"}` }} />
          </label>
        </div>

        <button type="button" onClick={done} className="w-full h-[52px] rounded-full mt-4 text-[16px] font-semibold text-white" style={{ background: INK }}>
          Done
        </button>
      </div>
    </div>
  );
}
