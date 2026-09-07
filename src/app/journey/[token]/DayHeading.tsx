"use client";

// The day heading on the shared page, and the reason the page lands where the
// reader actually is.
//
// The page lists every day from the first, so on day eight of a journey a
// passenger scrolled past seven days that had already happened to find out
// when breakfast was. The app has never had that problem — opening a journey
// while signed in lands on today — but the shared page never used that logic.
//
// Today is decided in the BROWSER, not on the server: a Vercel server runs on
// UTC and would call it tomorrow from 8pm Eastern onwards. Deciding it here
// also means the server and the first client render agree (both render no
// badge), so this cannot repeat the hydration failure the settings page had.

import { useEffect, useRef, useState } from "react";
import { isSameLocalDay } from "@/lib/isSameLocalDay";

export default function DayHeading({
  date,
  label,
  title,
}: {
  date: string;      // "YYYY-MM-DD"
  label: string;     // "Thursday 19 August"
  title: string | null;
}) {
  const [isToday, setIsToday] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isSameLocalDay(date)) return;

    setIsToday(true);
    // Jump, never glide: a smooth scroll through eleven days of itinerary is a
    // long animation to watch before you can read anything.
    ref.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [date]);

  return (
    <header ref={ref} style={{ scrollMarginTop: 16 }}>
      <h2 className="font-display italic text-[20px]">
        {label}
        {isToday && (
          <span
            className="ml-2 align-[2px] text-[10px] uppercase not-italic font-sans px-1.5 py-0.5 rounded"
            style={{ letterSpacing: "0.1em", background: "rgba(26,26,46,0.08)", color: "rgba(26,26,46,0.7)" }}
          >
            Today
          </span>
        )}
      </h2>
      {title && (
        <p className="text-[13px] mt-0.5" style={{ color: "rgba(26,26,46,0.62)" }}>
          {title}
        </p>
      )}
    </header>
  );
}
