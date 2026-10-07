"use client";

// "· in 3 days" / "· tomorrow" on the shared page's date line (7 Oct 2026,
// delight audit, mock approved). Worked out on the reader's phone after load,
// so it is right in their time zone; nothing during the trip (the day's
// "Today" tag says it) and nothing after.

import { useEffect, useState } from "react";
import { tripCountdown } from "@/lib/trips/countdown";

export function sharedCountdown(start: string | null, end: string | null, todayISO: string): string | null {
  const c = tripCountdown(start, end, todayISO);
  if (!c || c.startsWith("DAY ") || c === "JUST BACK") return null;
  return c.toLowerCase();
}

export default function SharedCountdown({ start, end }: { start: string | null; end: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setText(sharedCountdown(start, end, today));
  }, [start, end]);
  if (!text) return null;
  return <span data-testid="shared-countdown" className="whitespace-nowrap"> · {text}</span>;
}
