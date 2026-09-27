"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { monthGrids } from "@/lib/week/tripCalendar";

/**
 * Jump to any day of the journey (27 Sep 2026). Opened from the dates in the
 * masthead: the journey's months as calendars, a dot on each day that has
 * plans. A day opens in the week, in place (/plan?day=), or on the day page
 * for a guest, who has no week. The arrows stay for stepping week by week.
 */
export default function TripCalendar({
  tripId, days, guest = false, onClose,
}: {
  tripId: string;
  days: { id: string; date: string }[];
  guest?: boolean;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const router = useRouter();
  const [planned, setPlanned] = useState<Set<string>>(() => new Set());
  // The dots cost one small read, and only when the calendar is opened.
  useEffect(() => {
    let off = false;
    createClient().from("cards").select("day_id").eq("trip_id", tripId).eq("status", "in_itinerary").not("archived", "is", true).not("day_id", "is", null)
      .then(({ data }) => { if (!off) setPlanned(new Set((data ?? []).map((c) => c.day_id as string))); });
    return () => { off = true; };
  }, [tripId]);
  const months = useMemo(() => monthGrids(days, planned), [days, planned]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    window.addEventListener("pointerdown", out);
    return () => window.removeEventListener("pointerdown", out);
  }, [onClose]);

  const open = (dayId: string) => {
    onClose();
    router.push(guest ? `/trips/${tripId}/days/${dayId}` : `/trips/${tripId}/plan?day=${dayId}`);
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Jump to a day"
      className="absolute left-0 top-full mt-2 z-[70] bg-white rounded-2xl p-4 flex gap-6 max-h-[70vh] overflow-auto"
      style={{ boxShadow: "0 12px 32px rgba(26,26,46,0.18)", letterSpacing: "normal" }}
    >
      {months.map((m) => (
        <div key={m.key} className="w-[224px] flex-shrink-0">
          <p className="text-[13px] font-semibold text-[#1A1A2E] mb-2">{m.label}</p>
          <div className="grid grid-cols-7 gap-0.5 text-[10px] text-gray-400 mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i} className="text-center">{l}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {m.weeks.flat().map((c, i) => {
              if (!c) return <span key={i} />;
              const n = +c.date.slice(8, 10);
              if (!c.dayId) return <span key={i} className="h-8 flex items-center justify-center text-[12px] text-gray-300">{n}</span>;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => open(c.dayId!)}
                  aria-label={new Date(c.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  className="h-8 rounded-lg flex flex-col items-center justify-center text-[12px] font-medium text-[#1A1A2E] bg-[#F3EFE4] hover:bg-[#1A1A2E] hover:text-white transition-colors"
                >
                  <span className="leading-none">{n}</span>
                  <span className={`mt-0.5 w-1 h-1 rounded-full ${c.planned ? "bg-activity" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
