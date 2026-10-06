"use client";

// ── To book, at the top of Bookings (6 Oct 2026, mock approved) ────────────
// Three rows — Flights, Stays, Car. Tap a row that is still open and Kayak
// opens filled in (lib/booking/kayak); tap the box for Booked / Not needed.
// A row ticks itself when the journey already has it on its days
// (lib/booking/checklist). The owner's choices live in trips.booking_checklist.
// Owner only: a guest opening Bookings sees the uploads and nothing else, and
// the shared link never shows Bookings at all.
//
// Reads its own rows, so every host of DocumentsSheet gets it with no new
// plumbing. Arrival airports are asked for lazily, only when this renders for
// the owner with Flights or Car open and no codes on the journey's own flights.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import {
  checklistRows, needsAirports, readChecklist, withChoice,
  type CheckCard, type CheckInput, type CheckRow, type Checklist, type Choice, type RowKey,
} from "@/lib/booking/checklist";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const RULE = "rgba(26,26,46,0.10)";

/** One answer per journey per page load: the server caches for good anyway. */
const airportsAsked = new Map<string, string[]>();

type Loaded = Omit<CheckInput, "airports" | "trip"> & { trip: CheckInput["trip"] & { id: string } };

function Box({ state }: { state: CheckRow["state"] }) {
  if (state === "booked") {
    return (
      <span className="w-[22px] h-[22px] rounded-[6px] grid place-items-center" style={{ background: INK, border: `2px solid ${INK}` }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17 19 7" /></svg>
      </span>
    );
  }
  return (
    <span className="w-[22px] h-[22px] rounded-[6px] grid place-items-center" style={{ border: `2px ${state === "skip" ? "dashed" : "solid"} ${CAPTION}` }}>
      {state === "skip" && <span className="block w-[10px] h-[2px]" style={{ background: CAPTION }} />}
    </span>
  );
}

export default function ToBookSection({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [airports, setAirports] = useState<string[] | null>(airportsAsked.get(tripId) ?? null);
  const [menu, setMenu] = useState<RowKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: session }, trip, days, cards, people] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("trips").select("id, user_id, destination, start_date, end_date, party_size, party_ages, booking_checklist").eq("id", tripId).maybeSingle(),
        supabase.from("days").select("id, date").eq("trip_id", tripId),
        supabase.from("cards").select("id, day_id, place_id, status, start_time, end_time, details, place:places(sub_type, title, address)").eq("trip_id", tripId).not("day_id", "is", null),
        supabase.from("people").select("birthdate").eq("trip_id", tripId),
      ]);
      const uid = session?.session?.user?.id ?? null;
      const t = trip.data as (CheckInput["trip"] & { id: string; user_id: string }) | null;
      // Owner only: guests (and cohosts) never see the checklist.
      if (cancelled || !t || !uid || t.user_id !== uid) return;
      const { data: me } = await supabase.from("users").select("home_airport, home_country").eq("id", uid).maybeSingle();
      if (cancelled) return;
      setData({
        trip: t,
        home: { airport: (me?.home_airport as string | null) ?? null, country: (me?.home_country as string | null) ?? null },
        days: (days.data ?? []) as { id: string; date: string }[],
        cards: (cards.data ?? []) as unknown as CheckCard[],
        birthdates: ((people.data ?? []) as { birthdate: string | null }[]).map((p) => p.birthdate),
      });
    })().catch((e) => console.error("[to book]", e));
    return () => { cancelled = true; };
  }, [tripId]);

  // Arrival airports, lazily and at most once per journey per page load.
  useEffect(() => {
    if (!data || airports != null || !needsAirports({ ...data, airports: null })) return;
    let cancelled = false;
    fetch("/api/booking/airports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId }) })
      .then((r) => (r.ok ? r.json() : { airports: [] }))
      .then((j: { airports?: unknown }) => {
        const codes = Array.isArray(j.airports) ? j.airports.filter((c): c is string => typeof c === "string") : [];
        airportsAsked.set(tripId, codes);
        if (!cancelled) setAirports(codes);
      })
      .catch(() => { if (!cancelled) setAirports([]); });
    return () => { cancelled = true; };
  }, [data, airports, tripId]);

  const save = useCallback(async (next: Checklist) => {
    if (!data) return false;
    setData((d) => (d ? { ...d, trip: { ...d.trip, booking_checklist: next } } : d));
    const { error } = await queuedUpdate("trips", { id: data.trip.id }, { booking_checklist: next });
    return !error;
  }, [data]);

  const choose = useCallback(async (key: RowKey, choice: Choice | null, title: string) => {
    setMenu(null);
    if (!data) return;
    const before = readChecklist(data.trip.booking_checklist);
    const ok = await save(withChoice(before, key, choice));
    if (!ok) {
      setData((d) => (d ? { ...d, trip: { ...d.trip, booking_checklist: before } } : d));
      toast({ message: "Couldn't save that. Try again." });
      return;
    }
    toast({
      message: choice === "booked" ? `${title}: booked` : choice === "skip" ? `${title}: not needed` : `${title}: cleared`,
      undo: async () => {
        if (!(await save(before))) toast({ message: "Couldn't undo that. Try again." });
      },
    });
  }, [data, save, toast]);

  if (!data) return null;
  const rows = checklistRows({ ...data, airports });

  return (
    <div className="px-5 pt-3" data-testid="to-book">
      <p className="text-[10.5px] uppercase tracking-[0.1em] pb-1" style={{ color: CAPTION }}>To book</p>
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden="true" />}
      {rows.map((r) => {
        const body = (
          <>
            <span className="flex-1 min-w-0">
              <span className={`block text-[14px] font-semibold ${r.state === "booked" ? "line-through" : ""}`} style={{ color: r.state === "open" ? INK : CAPTION }}>{r.title}</span>
              <span className="block text-[12px] mt-0.5 truncate" style={{ color: CAPTION }}>{r.line}</span>
            </span>
            {r.url && <span aria-hidden="true" className="ml-2 text-[16px] flex-shrink-0" style={{ color: CAPTION }}>↗</span>}
          </>
        );
        return (
          <div key={r.key} className="relative flex items-center" style={{ borderTop: `1px solid ${RULE}` }} data-testid={`to-book-${r.key}`} data-state={r.state}>
            <button
              type="button"
              onClick={() => setMenu(menu === r.key ? null : r.key)}
              aria-label={`${r.title}: ${r.state === "booked" ? "booked" : r.state === "skip" ? "not needed" : "to book"}. Change`}
              aria-haspopup="menu"
              aria-expanded={menu === r.key}
              className="-ml-[11px] p-[11px] flex-shrink-0"
            >
              <Box state={r.state} />
            </button>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center py-3 pl-1">{body}</a>
            ) : (
              <div className="flex-1 min-w-0 flex items-center py-3 pl-1">{body}</div>
            )}
            {menu === r.key && (
              <div role="menu" className="absolute left-6 top-[44px] z-20 bg-white rounded-xl overflow-hidden grid text-[13px] min-w-[140px]"
                style={{ border: `1px solid ${RULE}`, boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
                <button type="button" role="menuitem" onClick={() => choose(r.key, "booked", r.title)} className="text-left px-4 py-[10px] font-semibold" style={{ color: INK }}>Booked</button>
                <button type="button" role="menuitem" onClick={() => choose(r.key, "skip", r.title)} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Not needed</button>
                {r.manual && (
                  <button type="button" role="menuitem" onClick={() => choose(r.key, null, r.title)} className="text-left px-4 py-[10px]" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>Clear</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
