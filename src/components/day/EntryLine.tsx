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

      if (row?.changed && row.data) {
        toast({ message: `Entry rules for ${row.data.country} changed since your last check.${row.data.change_note ? ` ${row.data.change_note}` : ""}`, duration: 9000 });
        void supabase.from("trip_entry").update({ changed: false }).eq("trip_id", trip.id);
      }

      if (readOnly) return;
      const daysToGo = trip.start_date ? Math.round((new Date(trip.start_date + "T12:00:00").getTime() - Date.now()) / 86400000) : null;
      if (daysToGo == null || daysToGo < 0) return; // past journeys are not checked
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
        toast({ message: `Entry rules for ${j.data.country} changed. ${j.data.change_note}`, duration: 9000 });
        void supabase.from("trip_entry").update({ changed: false }).eq("trip_id", trip.id);
      } else if (firstTime && j.data.lines.some((l) => l.action)) {
        toast({ message: `Entry requirements for ${j.data.country} are in Journey settings. Something needs doing before you go.`, duration: 7000 });
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
  if (!headline || dayDate !== firstDay || !beforeDeparture) return null;

  return (
    <div className="px-4 pt-2 md:px-0 md:max-w-[720px] md:mx-auto">
      <TripSettingsLink
        tripId={trip.id}
        section="entry"
        trip={trip}
        days={days}
        className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
        style={{ background: "rgba(176,84,31,0.09)", color: SIENNA }}
        ariaLabel="Entry requirements"
      >
        <span>{headline}</span>
        <span aria-hidden="true" className="text-[16px]">›</span>
      </TripSettingsLink>
    </div>
  );
}
