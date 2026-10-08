"use client";

// Eve of departure (7 Oct 2026, delight audit, mock d11): the day before the
// journey starts, the organiser's first open shows "Lisbon tomorrow · all
// booked ✓" or "Lisbon tomorrow · 2 still to book" with a Bookings button.
// Once per journey on this device. Phone Day view and the Plan route
// (PlanSwitch), like useMemberJoinedToast. Rules: lib/trips/eveOfDeparture.
//
// The rows are read exactly as the Bookings sheet (ToBookSection) reads them:
// the same four queries, the same owner check, the same lazy airport ask, then
// lib/booking/checklist checklistRows. Nothing is loaded on any other day.

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { localDate } from "@/lib/isSameLocalDay";
import { checklistRows, needsAirports, type CheckCard, type CheckInput } from "@/lib/booking/checklist";
import { claimEve, eveMessage, eveSeen, isEveOfDeparture, stillToBook } from "@/lib/trips/eveOfDeparture";

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The Bookings rows for the owner, or null for anyone else / a failed read. */
async function loadRows(tripId: string) {
  const supabase = createClient();
  const [{ data: session }, trip, days, cards, people] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from("trips").select("id, user_id, destination, start_date, end_date, party_size, party_ages, booking_checklist").eq("id", tripId).maybeSingle(),
    supabase.from("days").select("id, date").eq("trip_id", tripId),
    supabase.from("cards").select("id, day_id, place_id, status, confirmed, start_time, end_time, details, place:places(sub_type, title, address)").eq("trip_id", tripId).not("day_id", "is", null),
    supabase.from("people").select("birthdate").eq("trip_id", tripId),
  ]);
  const uid = session?.session?.user?.id ?? null;
  const t = trip.data as (CheckInput["trip"] & { user_id: string }) | null;
  // Organiser only: a guest or cohost never sees it.
  if (!t || !uid || t.user_id !== uid) return null;
  const { data: me } = await supabase.from("users").select("home_airport, home_country, passport_country").eq("id", uid).maybeSingle();
  const input: CheckInput = {
    trip: t,
    home: {
      airport: (me?.home_airport as string | null) ?? null,
      country: (me?.home_country as string | null) ?? null,
      passport: (me?.passport_country as string | null) ?? null,
    },
    days: (days.data ?? []) as { id: string; date: string }[],
    cards: (cards.data ?? []) as unknown as CheckCard[],
    birthdates: ((people.data ?? []) as { birthdate: string | null }[]).map((p) => p.birthdate),
    airports: null,
  };
  if (needsAirports(input)) {
    try {
      const r = await fetch("/api/booking/airports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId }) });
      const j = (r.ok ? await r.json() : { airports: [] }) as { airports?: unknown };
      input.airports = Array.isArray(j.airports) ? j.airports.filter((c): c is string => typeof c === "string") : [];
    } catch {
      input.airports = [];
    }
  }
  return checklistRows(input);
}

export function useEveOfDepartureToast(tripId: string, destination: string, startDate: string, enabled: boolean) {
  const { toast } = useToast();
  useEffect(() => {
    if (!enabled || !isEveOfDeparture(startDate, localDate(new Date()))) return;
    if (eveSeen(localStore(), tripId)) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadRows(tripId);
        if (cancelled || !rows) return;
        if (!claimEve(localStore(), tripId)) return;
        const open = stillToBook(rows);
        toast({
          message: eveMessage(destination, open),
          action: open > 0
            ? { label: "Bookings", onClick: () => window.dispatchEvent(new CustomEvent("roam:open-bookings")) }
            : undefined,
          // Waits behind a "joined" toast instead of replacing it (7 Oct 2026, re-audit).
          wait: true,
        });
      } catch {
        // Offline or a failed read: say nothing.
      }
    })();
    return () => { cancelled = true; };
  }, [tripId, destination, startDate, enabled, toast]);
}
