"use client";

import { useEffect, useMemo, useState } from "react";
import { requestNotes } from "@/hooks/useCardNotes";
import type { Card, Day, Trip } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useRouter } from "next/navigation";
import { previewDraft, planRoom, dayWords, hasChildren, untouchedPlan } from "@/lib/plan/draftRows";
import { slotWord, leftLine } from "@/lib/plan/mealsOnDays";
import { shortDay } from "@/lib/confirmations/outsideDates";
import { hasSeniors } from "@/lib/party";

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
  trip, days, cards, onClose, onDrafted, trayUndo = false,
}: {
  trip: Trip;
  days: Day[];
  /** Every card on the journey: saved and scheduled. */
  cards: Card[];
  onClose: () => void;
  /** The draft cards, as inserted, with their places. */
  onDrafted: (created: Card[]) => void;
  /** The host shows its own "Planned … · Undo" tray (the computer's week), so no toast. */
  trayUndo?: boolean;
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
  // Young children or anyone 65+: the gentle pace (three places a day, breaks; lib/plan/pace).
  const kids = hasChildren(trip.party_ages, birthdates, trip.party_size, trip.start_date) || hasSeniors(trip.party_ages);
  const preview = useMemo(() => previewDraft(cards, days, kids), [cards, days, kids]);
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(preview.suggested));
  const [busy, setBusy] = useState(false);
  // "See which": the names of the food that stays saved, folded (6 Oct 2026).
  const [leftOpen, setLeftOpen] = useState(false);

  const many = preview.regions.length > 1;
  // What the planner would do (lib/plan/draftRows planRoom): with the areas
  // it suggests, for whether there is anything to plan at all, and with the
  // ticked ones, for the line and the button. The sheet never counts free
  // days on its own: Hanoi said "0.5 free" and offered Plan the trip, and
  // pressing it planned nothing (2 Oct 2026, Brennan: "It shouldn't offer both").
  const room = useMemo(() => planRoom(trip.id, cards, days, { kids, regions: preview.suggested }), [trip.id, cards, days, kids, preview.suggested]);
  const picked = useMemo(() => planRoom(trip.id, cards, days, { kids, regions: Array.from(chosen) }), [trip.id, cards, days, kids, chosen]);
  // The button now shows on every trip (1 Oct 2026, Brennan: "always visible
  // ... but a warning"), so the sheet says why there is nothing to do:
  // nothing saved, or no room for what is.
  const nothing = room.fits === 0 && room.saved === 0 && room.free >= 0.5;
  // No room (1 Oct 2026): say so on open, not in a toast after "Plan the
  // trip" (Brennan: "it needs to say something to the effect of the trip is
  // fully planned").
  const full = room.fits === 0 && !nothing;
  const places = room.saved;
  const over = picked.fits < places;
  const titleOf = (cardId: string) => cards.find((c) => c.id === cardId)?.place?.title ?? "a saved place";

  const make = async () => {
    setBusy(true);
    // Exactly what the sheet described (planRoom), so the two cannot disagree.
    const { rows } = picked;
    if (rows.length === 0) { setBusy(false); return; }
    const withIds = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
    const supabase = createClient();
    const { error } = await supabase.from("cards").insert(withIds);
    setBusy(false);
    if (error) { toast({ message: "Couldn't plan it. Try again." }); return; }
    const placeOf = new Map(cards.filter((c) => c.place_id && c.place).map((c) => [c.place_id as string, c.place!]));
    const created = withIds.map((r) => ({ ...r, list_id: null, created_at: new Date().toISOString(), place: placeOf.get(r.place_id) ?? null })) as unknown as Card[];
    onDrafted(created);
    // Each card's Intent and Know before you go, for every planned day at once
    // (hooks/useCardNotes): screens showing the cards fold the notes in.
    void requestNotes(trip.id, withIds.map((w) => w.id));
    // A travel card before each day trip, the better of driving and public
    // transport from that night's stay (api/plan/getting-there). Undo takes them too.
    const travel: string[] = [];
    void fetch("/api/plan/getting-there", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, cardIds: withIds.map((w) => w.id) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { created?: string[]; moved?: unknown[] } | null) => {
        if (j?.created?.length || j?.moved?.length) {
          travel.push(...(j.created ?? []));
          // The week's tray owns Undo there, so it needs these too (lib: WeekBoard undoPlan).
          if (trayUndo && j.created?.length) window.dispatchEvent(new CustomEvent("roam:plan-travel", { detail: j.created }));
          router.refresh();
        }
      })
      .catch(() => undefined);
    const dayCount = new Set(rows.map((r) => r.day_id)).size;
    // One Undo (2 Oct 2026, Brennan): on a computer the week's tray says what
    // was planned and has Undo and Where to stay, so no toast saying it again.
    if (trayUndo) { onClose(); return; }
    toast({
      message: `Planned ${rows.length} ${rows.length === 1 ? "place" : "places"} on ${dayCount} ${dayCount === 1 ? "day" : "days"}`,
      undo: async () => {
        const ids = [...withIds.map((w) => w.id), ...travel];
        const r = await supabase.from("cards").delete().in("id", ids);
        if (r.error) toast({ message: "Couldn't undo. Try again." });
        else { window.dispatchEvent(new CustomEvent("roam:draft-removed", { detail: ids })); router.refresh(); }
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
            {full ? (
              <p className="text-[13px] mt-1" style={{ color: "rgba(26,26,46,0.62)" }} data-testid="plan-full">
                {room.free < 0.5 ? (
                  <span className="block text-[14px] font-semibold text-[#1A1A2E] mb-0.5">Every day is planned. Enjoy it.</span>
                ) : (
                  <>
                    <span className="block text-[14px] font-semibold text-[#1A1A2E] mb-0.5">No room for what&rsquo;s left.</span>
                    {room.free < 1
                      ? "Only half a day is free, and each place left needs more than that. "
                      : `${dayWords(room.free)[0].toUpperCase()}${dayWords(room.free).slice(1)} ${room.free < 2 ? "is" : "are"} free, but none of the places left fit. `}
                  </>
                )}
                {/* The how-to line ("To plan more, take some places off a day…")
                    went on 6 Oct 2026 (designer audit): Remove below is the way
                    back, and the line only introduced it. */}
              </p>
            ) : nothing ? (
              <p className="text-[13px] mt-1" style={{ color: "rgba(26,26,46,0.62)" }} data-testid="plan-nothing">
                <span className="block text-[14px] font-semibold text-[#1A1A2E] mb-0.5">Nothing saved to plan yet.</span>
                Save places on the map or with Find, then run Plan my trip.
              </p>
            ) : (
            <p className="text-[13px] mt-1" style={{ color: over ? "#9A5B00" : "rgba(26,26,46,0.62)" }}>
              {/* "5 of 3 free days" read as nonsense (New York test, 29 Sep 2026). */}
              {/* Counts of places, never fractions of days ("0.5 free", 2 Oct 2026). */}
              {places} saved {places === 1 ? "place" : "places"} · {picked.fits === 0
                ? "none of the ticked areas fit"
                : over
                  ? `${picked.fits} fit, so ${places - picked.fits} stay saved`
                  : `all fit, on ${picked.days} ${picked.days === 1 ? "day" : "days"}`}
            </p>
            )}
            {!nothing && (picked.meals.placed.length > 0 || picked.meals.left.length > 0) && (
              // Saved food goes on days already planned, as meals (lib/plan/mealsOnDays):
              // say which, and why any cannot (Muskoka, 3 Oct 2026).
              <ul className="text-[13px] mt-2 flex flex-col gap-1" style={{ color: "rgba(26,26,46,0.62)" }} data-testid="plan-meals">
                {[...picked.meals.placed].sort((a, b) => days.findIndex((x) => x.id === a.dayId) - days.findIndex((x) => x.id === b.dayId) || a.start - b.start).map((m) => {
                  const d = days.find((x) => x.id === m.dayId);
                  return <li key={m.id}>{slotWord(m.slot)} at {titleOf(m.id)}, {d ? shortDay(d.date) : ""}, {m.slot === "coffee" ? "before" : "near"} {m.near}.</li>;
                })}
                {(() => {
                  // One line for the food that stays saved, the names behind
                  // "See which" (lib/plan/mealsOnDays leftLine). A single place
                  // keeps its own sentence.
                  const sum = leftLine(picked.meals.left);
                  if (!sum) return picked.meals.left.map((m) => <li key={m.id}>{m.title} stays saved. {m.reason}</li>);
                  return (
                    <li key="left" data-testid="plan-meals-left">
                      {sum.line}{" "}
                      <button type="button" onClick={() => setLeftOpen((v) => !v)} aria-expanded={leftOpen}
                        className="underline underline-offset-2 text-[#1A1A2E]">
                        {leftOpen ? "Hide" : "See which"}
                      </button>
                      {leftOpen && (
                        <ul className="mt-1 flex flex-col gap-0.5 pl-3" data-testid="plan-meals-left-names">
                          {picked.meals.left.map((m) => <li key={m.id}>{m.title}{sum.allFull ? "" : ` — ${m.reason}`}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })()}
              </ul>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {many && !full && !nothing && (
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

        {!full && !nothing && <button
          type="button"
          onClick={() => void make()}
          disabled={busy || picked.fits === 0}
          className="h-11 rounded-full text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "#1A1A2E" }}
        >
          {busy ? "Planning…" : "Plan the trip"}
        </button>}
        {planMade.length > 0 && (
          <button
            type="button"
            onClick={() => void removePlan()}
            disabled={busy}
            className="min-h-[44px] text-[13px] underline underline-offset-2 disabled:opacity-40"
            style={{ color: "rgba(26,26,46,0.55)" /* a quiet grey link, not sienna (6 Oct 2026): it is the way back, rarely used */ }}
          >
            Remove what Plan my trip added ({planMade.length} {planMade.length === 1 ? "place" : "places"})
          </button>
        )}
      </div>
    </div>
  );
}
