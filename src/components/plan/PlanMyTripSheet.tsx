"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card, Day, Trip } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useRouter } from "next/navigation";
import { previewDraft, buildDraft, hasChildren, untouchedPlan } from "@/lib/plan/draftRows";

/**
 * "Plan my trip" (28 Sep 2026): the journey's saved places become the plan
 * of the whole trip — ordinary cards on free days, with times; nothing to
 * confirm (29 Sep 2026). Undo right after; later, "Remove what Plan my trip
 * added" takes off the cards still where it put them. When the places need more days than the
 * journey has, the regions are listed with the days each needs and the ones
 * that fit are ticked; which to see is the person's call. Opened from the
 * Plan chip beside Filter on the week's map and on the phone Map.
 * Proposal: https://claude.ai/artifact/VTGr4dT3GhmhXFTaXmdT56
 */
export default function PlanMyTripSheet({
  trip, days, cards, onClose, onDrafted,
}: {
  trip: Trip;
  days: Day[];
  /** Every card on the journey: saved and scheduled. */
  cards: Card[];
  onClose: () => void;
  /** The draft cards, as inserted, with their places. */
  onDrafted: (created: Card[]) => void;
}) {
  useEscapeKey(onClose);
  const { toast } = useToast();
  const router = useRouter();
  // Cards Plan my trip added that are still where it put them.
  const planMade = useMemo(() => cards.filter(untouchedPlan), [cards]);
  // The travellers' birthdates, for a journey with no ages saved (New York's are people rows).
  const [birthdates, setBirthdates] = useState<(string | null)[]>([]);
  useEffect(() => {
    let off = false;
    createClient().from("people").select("birthdate").eq("trip_id", trip.id)
      .then(({ data }) => { if (!off && data) setBirthdates(data.map((r) => r.birthdate as string | null)); });
    return () => { off = true; };
  }, [trip.id]);
  const kids = hasChildren(trip.party_ages, birthdates, trip.party_size, trip.start_date);
  const preview = useMemo(() => previewDraft(cards, days, kids), [cards, days, kids]);
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(preview.suggested));
  const [busy, setBusy] = useState(false);

  const many = preview.regions.length > 1;
  const need = preview.regions.filter((r) => chosen.has(r.id)).reduce((s, r) => s + r.days, 0) + 0.5 * Math.max(0, chosen.size - 1);
  const needText = Number.isInteger(need) ? String(need) : need.toFixed(1);
  const over = need > preview.free;
  const places = preview.grouping.groups.reduce((s, g) => s + g.items.length + g.meals.length, 0);

  const make = async () => {
    setBusy(true);
    const { rows } = buildDraft(trip.id, cards, days, { kids, regions: Array.from(chosen) });
    if (rows.length === 0) { setBusy(false); toast({ message: "Nothing to plan: every free day is taken." }); return; }
    const withIds = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
    const supabase = createClient();
    const { error } = await supabase.from("cards").insert(withIds);
    setBusy(false);
    if (error) { toast({ message: "Couldn't plan it. Try again." }); return; }
    const placeOf = new Map(cards.filter((c) => c.place_id && c.place).map((c) => [c.place_id as string, c.place!]));
    const created = withIds.map((r) => ({ ...r, list_id: null, created_at: new Date().toISOString(), place: placeOf.get(r.place_id) ?? null })) as unknown as Card[];
    onDrafted(created);
    // Each card's Intent and Know before you go, written in the background
    // (api/plan/notes); the week refreshes when they land. Nothing waits on it.
    void fetch("/api/plan/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, cardIds: withIds.map((w) => w.id) }) })
      .then((r) => r.json()).then((j: { written?: number }) => { if (j.written) router.refresh(); }).catch(() => {});
    const dayCount = new Set(rows.map((r) => r.day_id)).size;
    toast({
      message: `Planned ${rows.length} ${rows.length === 1 ? "place" : "places"} on ${dayCount} ${dayCount === 1 ? "day" : "days"}`,
      undo: async () => {
        const r = await supabase.from("cards").delete().in("id", withIds.map((w) => w.id));
        if (r.error) toast({ message: "Couldn't undo. Try again." });
        else { window.dispatchEvent(new CustomEvent("roam:draft-removed", { detail: withIds.map((w) => w.id) })); router.refresh(); }
      },
    });
    onClose();
  };

  // Take off what Plan my trip added and nobody has moved since.
  const removePlan = async () => {
    const gone = planMade;
    if (!gone.length) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("cards").delete().in("id", gone.map((c) => c.id));
    setBusy(false);
    if (error) { toast({ message: "Couldn't remove them. Try again." }); return; }
    window.dispatchEvent(new CustomEvent("roam:draft-removed", { detail: gone.map((c) => c.id) }));
    router.refresh();
    toast({
      message: `Removed ${gone.length} ${gone.length === 1 ? "place" : "places"} Plan my trip added`,
      undo: async () => {
        const rows = gone.map((c) => ({ id: c.id, day_id: c.day_id, trip_id: c.trip_id, start_time: c.start_time, end_time: c.end_time, position: c.position, status: c.status, source_url: c.source_url, details: c.details, ai_generated: c.ai_generated, confirmed: c.confirmed, place_id: c.place_id }));
        const r = await supabase.from("cards").insert(rows);
        if (r.error) toast({ message: "Couldn't undo. Try again." }); else { onDrafted(gone); router.refresh(); }
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" onClick={onClose} style={{ background: "rgba(26,26,46,0.28)" }}>
      <div
        role="dialog"
        aria-label="Plan my trip"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:w-[420px] bg-white rounded-t-2xl md:rounded-2xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: "0 16px 40px rgba(26,26,46,0.22)", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[#1A1A2E] leading-tight">Plan my trip</h2>
            <p className="text-[13px] mt-1" style={{ color: over ? "#9A5B00" : "rgba(26,26,46,0.62)" }}>
              {/* "5 of 3 free days" read as nonsense (New York test, 29 Sep 2026). */}
              {places} saved {places === 1 ? "place" : "places"} · {over
                ? `about ${needText} days of places for ${preview.free} free, so some stay saved`
                : `${needText} of ${preview.free} free days`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {many && (
          <ul className="flex flex-col">
            {preview.regions.map((r) => {
              const on = chosen.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setChosen((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                    aria-pressed={on}
                    className="w-full min-h-[44px] flex items-center gap-3 py-2 border-t text-left"
                    style={{ borderColor: "rgba(26,26,46,0.08)" }}
                  >
                    <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center flex-shrink-0" style={{ background: on ? "#1A1A2E" : "transparent", border: on ? "1.5px solid #1A1A2E" : "1.5px solid rgba(26,26,46,0.25)" }}>
                      {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-medium truncate" style={{ color: on ? "#1A1A2E" : "rgba(26,26,46,0.5)" }}>{r.label}</span>
                      <span className="block text-[12px]" style={{ color: "rgba(26,26,46,0.55)" }}>{r.places} {r.places === 1 ? "place" : "places"}</span>
                    </span>
                    <span className="text-[13px] tabular-nums" style={{ color: on ? "#1A1A2E" : "rgba(26,26,46,0.5)" }}>{r.days} {r.days === 1 ? "day" : "days"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void make()}
          disabled={busy || chosen.size === 0 || places === 0}
          className="h-11 rounded-full text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "#1A1A2E" }}
        >
          {busy ? "Planning…" : "Plan the trip"}
        </button>
        {planMade.length > 0 && (
          <button
            type="button"
            onClick={() => void removePlan()}
            disabled={busy}
            className="min-h-[44px] text-[13px] font-medium text-[#B0541F] disabled:opacity-40"
          >
            Remove what Plan my trip added ({planMade.length} {planMade.length === 1 ? "place" : "places"})
          </button>
        )}
      </div>
    </div>
  );
}
