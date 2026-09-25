"use client";

import { useRef, useEffect, useState } from "react";
import type { Day } from "@/types/database";

interface Props {
  days: Day[];
  activeDayId: string;
  tripId: string;
  onDaySelect: (day: Day) => void;
  /** Hold a day for its actions (rename, give times, rearrange). */
  onDayLongPress?: (day: Day) => void;
}

/**
 * The day switcher.
 *
 * It was a row of filled pill tabs, each carrying the date and "Day 3"
 * underneath, over a progress bar — a tab control, which is what made the
 * agenda read as a tool. It is dates now, the current one underlined. The
 * "Day N" line went with it: you know it's the first day because it's first.
 */
export default function DayStrip({ days, activeDayId, onDaySelect, onDayLongPress }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  // Long-press (500ms, no drift) fires the day's actions; the click that
  // follows a long-press is swallowed.
  const pressTimer = useRef<number | null>(null);
  const pressed = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clearPress = () => { if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const onDown = (day: Day) => (e: React.PointerEvent) => {
    if (!onDayLongPress) return;
    start.current = { x: e.clientX, y: e.clientY }; pressed.current = false;
    pressTimer.current = window.setTimeout(() => { pressTimer.current = null; pressed.current = true; try { navigator.vibrate?.(30); } catch { /* */ } onDayLongPress(day); }, 500);
  };
  const onMove = (e: React.PointerEvent) => { if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clearPress(); };

  // Client-only today key — null on SSR and first paint so the today mark
  // doesn't render before hydration. Avoids the UTC-vs-local date mismatch
  // that surfaces as React #418/#422.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setTodayKey(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }, []);

  // First positioning is instant: day navigation remounts this strip, so a
  // smooth scroll here replays a start-to-centre sweep on every day change.
  const hasPositioned = useRef(false);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: hasPositioned.current ? "smooth" : "auto",
      block:    "nearest",
      inline:   "center",
    });
    hasPositioned.current = true;
  }, [activeDayId]);

  return (
    // Pins directly beneath the 58px day header, so the day you are on and the
    // way to the next one both stay put while the entries scroll.
    <div
      className="sticky top-[58px] z-20 bg-white md:hidden"
      style={{ borderBottom: "1px solid rgba(26,26,46,0.10)" }}
    >
      <div className="relative">
        <div className="flex gap-2 px-3 pt-1.5 pb-3 overflow-x-auto scrollbar-none">
          {days.map((day) => {
            const isActive = day.id === activeDayId;
            const today    = todayKey !== null && day.date === todayKey;

            // Local-parse (…T00:00:00) → the calendar date survives every
            // timezone, so weekday + date-of-month need no client-only guard.
            const dt     = new Date(day.date + "T00:00:00");
            const dow    = dt.toLocaleDateString("en-GB", { weekday: "short" });
            const dayNum = dt.getDate();

            return (
              <button
                key={day.id}
                ref={isActive ? activeRef : null}
                onClick={() => { if (pressed.current) { pressed.current = false; return; } onDaySelect(day); }}
                onPointerDown={onDown(day)}
                onPointerMove={onMove}
                onPointerUp={clearPress}
                onPointerCancel={clearPress}
                onContextMenu={(e) => e.preventDefault()}
                className="flex-shrink-0 min-w-[40px] text-center pb-2"
                style={{
                  boxShadow: isActive ? "inset 0 -1.5px 0 #1A1A2E" : undefined,
                }}
              >
                <span
                  className="block font-display text-[16px] leading-none"
                  style={{ color: isActive ? "#1A1A2E" : "rgba(26,26,46,0.35)" }}
                >
                  {dayNum}
                </span>
                <span
                  className="block text-[10px] uppercase mt-[3px] whitespace-nowrap"
                  style={{
                    letterSpacing: "0.15em",
                    color: today
                      ? "#B0541F"
                      : isActive
                        ? "rgba(26,26,46,0.62)"
                        : "rgba(26,26,46,0.28)",
                  }}
                >
                  {today ? "Today" : dow}
                </span>
              </button>
            );
          })}
        </div>
        {/* Right-edge fade — signals scrollable overflow */}
        <div
          className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none"
          style={{ background: "linear-gradient(to left, white, transparent)" }}
        />
      </div>
    </div>
  );
}
