"use client";

// ── The one entry-requirements line on the Agenda ─────────────────────────
// Shows only while something must still be done before departure, and goes
// when the owner ticks it in Journey settings. Also the quiet keeper of the
// rechecks: a journey with no answer yet is checked once in the background
// when the owner opens it; a journey inside its last thirty days is checked
// again if the answer is more than a week old; a changed answer is said once.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { TripSettingsLink } from "@/components/overlays/AppOverlays";
import { entryHeadline, type EntryData, type TripEntry } from "@/lib/entry/types";
import type { Trip, Day } from "@/types/database";

const SIENNA = "#B0541F";

export default function EntryLine({ trip, days, dayDate, readOnly }: { trip: Trip; days: Day[]; dayDate: string; readOnly?: boolean }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [entry, setEntry] = useState<TripEntry | null | undefined>(undefined);
  // The × remembers the exact words it hid, on this device. New words — the
  // rules changed at a recheck, or something got ticked — bring the line back.
  const hiddenKey = `roam:entry-line-hidden:${trip.id}`;
  const [hiddenText, setHiddenText] = useState<string | null>(null);
  useEffect(() => {
    try { setHiddenText(localStorage.getItem(hiddenKey)); } catch { /* private mode */ }
  }, [hiddenKey]);
  const hide = (text: string) => {
    try { localStorage.setItem(hiddenKey, text); } catch { /* private mode */ }
    setHiddenText(text);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data, error } = await supabase
        .from("trip_entry")
        .select("trip_id, passports, data, changed, checked_at")
        .eq("trip_id", trip.id)
        .maybeSingle();
      if (cancelled) return;
      // No table yet (or no access): do nothing, and spend nothing.
      if (error) return;
      const row = (data as TripEntry | null) ?? null;
      setEntry(row);

      const daysToGo = trip.start_date ? Math.round((new Date(trip.start_date + "T12:00:00").getTime() - Date.now()) / 86400000) : null;
      const upcoming = daysToGo != null && daysToGo >= 0;

      if (row?.changed && row.data) {
        // Said once, short, and only while the journey is still ahead — a
        // past journey has nothing to act on (a long one wrapped into a ball
        // on the phone; Brennan, Sep 2026).
        if (upcoming) toast({ message: `Entry rules for ${row.data.country} changed — see Settings.`, duration: 7000 });
        void supabase.from("trip_entry").update({ changed: false }).eq("trip_id", trip.id);
      }

      if (readOnly || !upcoming) return; // past journeys are not checked
      const ageDays = row?.checked_at ? (Date.now() - new Date(row.checked_at).getTime()) / 86400000 : Infinity;
      const firstTime = !row?.data;
      const dueRecheck = !firstTime && daysToGo <= 30 && ageDays > 7;
      if (!firstTime && !dueRecheck) return;

      const res = await fetch("/api/entry/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id }),
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const j = (await res.json()) as { passports: string[]; data: EntryData; changed: boolean };
      setEntry({ trip_id: trip.id, passports: j.passports, data: j.data, changed: false, checked_at: j.data.checked_at });
      if (j.changed && j.data.change_note) {
        toast({ message: `Entry rules for ${j.data.country} changed — see Settings.`, duration: 7000 });
        void supabase.from("trip_entry").update({ changed: false }).eq("trip_id", trip.id);
      } else if (firstTime && j.data.lines.some((l) => l.action)) {
        toast({ message: `Something to do before ${j.data.country} — see Entry in Settings.`, duration: 7000 });
      }
    };
    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const headline = entryHeadline(entry?.data);
  // On the first day only, and only before departure — not on all eleven days
  // of a journey, and not once you are there.
  const firstDay = days[0]?.date;
  const beforeDeparture = trip.start_date ? new Date(trip.start_date + "T12:00:00").getTime() > Date.now() : false;
  if (!headline || dayDate !== firstDay || !beforeDeparture || hiddenText === headline) return null;

  const closeButton = (
    <button
      type="button"
      onClick={() => hide(headline)}
      aria-label="Hide this until the rules change"
      className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60"
      style={{ color: SIENNA }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

  // A guest can't open settings, so for them the line is the words alone.
  if (readOnly) {
    return (
      <div className="px-4 pt-2 md:px-0 md:max-w-[720px] md:mx-auto">
        <div className="flex items-center gap-2 rounded-xl pl-3.5 pr-1.5 py-1 text-[13.5px] leading-snug" style={{ background: "rgba(176,84,31,0.09)", color: SIENNA }}>
          <span className="flex-1 py-1.5">{headline}</span>
          {closeButton}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 md:px-0 md:max-w-[720px] md:mx-auto">
      {/* The words open Settings; the × beside them is its own button, not
          nested inside the link. */}
      <div className="flex items-center gap-1 rounded-xl pl-3.5 pr-1.5 py-1" style={{ background: "rgba(176,84,31,0.09)", color: SIENNA }}>
        <TripSettingsLink
          tripId={trip.id}
          section="entry"
          trip={trip}
          days={days}
          className="flex-1 min-w-0 flex items-center justify-between gap-3 py-1.5 text-[13.5px] leading-snug"
          ariaLabel="Entry requirements"
        >
          <span>{headline}</span>
          <span aria-hidden="true" className="text-[16px]">›</span>
        </TripSettingsLink>
        {closeButton}
      </div>
    </div>
  );
}
