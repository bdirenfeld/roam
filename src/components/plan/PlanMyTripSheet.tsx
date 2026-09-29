"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card, Day, Trip } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { previewDraft, buildDraft, hasChildren } from "@/lib/plan/draftRows";

/**
 * "Plan my trip" (28 Sep 2026): the journey's saved places become a draft
 * of the whole trip — dashed cards on free days, with times — which the
 * person keeps or clears day by day. When the places need more days than the
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
    if (error) { toast({ message: "Couldn't make the draft. Try again." }); return; }
    const placeOf = new Map(cards.filter((c) => c.place_id && c.place).map((c) => [c.place_id as string, c.place!]));
    const created = withIds.map((r) => ({ ...r, list_id: null, created_at: new Date().toISOString(), place: placeOf.get(r.place_id) ?? null })) as unknown as Card[];
    onDrafted(created);
    const dayCount = new Set(rows.map((r) => r.day_id)).size;
    toast({
      message: `Draft on ${dayCount} ${dayCount === 1 ? "day" : "days"}. Keep or clear each day.`,
      undo: async () => {
        const r = await supabase.from("cards").delete().in("id", withIds.map((w) => w.id));
        if (r.error) toast({ message: "Couldn't undo. Try again." });
        else window.dispatchEvent(new CustomEvent("roam:draft-removed", { detail: withIds.map((w) => w.id) }));
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
              {places} saved {places === 1 ? "place" : "places"} · {needText} of {preview.free} free days
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
          disabled={busy || chosen.size === 0}
          className="h-11 rounded-full text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "#1A1A2E" }}
        >
          {busy ? "Planning…" : "Make a draft"}
        </button>
      </div>
    </div>
  );
}
