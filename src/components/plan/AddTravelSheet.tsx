"use client";

/**
 * Add travel (Brennan, 14 Nov 2026, approved mock "Add travel" steps 1–4).
 * Waze-like: say where you are going, the start is already filled in (last
 * night's stay), the app asks Google for the drive and transit times, you pick
 * one, and the card is made with its times worked back from the stop it goes
 * to (lib/travel/leaveTime). Opened from the add sheet's "Travel" row.
 *
 * Where a trip ends is any place now, not only a station or car park. The
 * card still ends at a logistics/transit place, as every travel card always
 * has: a picked station is reused; a picked villa, restaurant or town gets a
 * travel end of its own at the same spot, so the villa stays a hotel (stays,
 * check-ins and the map never mistake a drive for a night) and a restaurant
 * card keeps its own place.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { getAuthUser } from "@/lib/supabase/authUser";
import { queuedDelete } from "@/lib/offline/queuedWrite";
import { useToast } from "@/components/ui/Toast";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { LegFromSearch, LegModePicker, LegRoute, useDefaultFrom } from "@/components/cards/TravelLegPanel";
import type { LegFrom, LegMode } from "@/lib/travel/leg";
import { estimateLabel, changesLabel, planMinutes, type LegEstimate } from "@/lib/travel/estimate";
import { planLeave, withLeave, type DayStop, type LeavePlan } from "@/lib/travel/leaveTime";
import { isParkOrStation, inItaly, parkMinutes, ZTL_LINE, type Park } from "@/lib/travel/park";
import { formatTimeValue } from "@/lib/formatTime";

const INK = "#1A1A2E";
const CAP = "rgba(26,26,46,0.62)";
const MODE_WORD: Record<LegMode, string> = { drive: "Drive", bus: "Bus", train: "Train", ferry: "Ferry" };
const MODE_EMOJI: Record<LegMode, string> = { drive: "🚗", bus: "🚌", train: "🚆", ferry: "⛴️" };

interface Props {
  dayId: string;
  tripId: string;
  endPosition: number;
  dayLabel?: string;
  biasLat?: number | null;
  biasLng?: number | null;
  onBack: () => void;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
  onCardRemoved?: (cardId: string) => void;
}

type Way = { key: string; mode: LegMode; mins: number; extra: string };

export default function AddTravelSheet({
  dayId, tripId, endPosition, dayLabel, biasLat, biasLng, onBack, onClose, onCardCreated, onCardRemoved,
}: Props) {
  const { toast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const drag = useSheetDrag(onClose);

  const lastNight = useDefaultFrom(tripId, dayId, true);
  const [fromPick, setFromPick] = useState<LegFrom | null>(null);
  const from = fromPick ?? lastNight;
  const [to, setTo] = useState<LegFrom | null>(null);
  const [editing, setEditing] = useState<"from" | "to" | null>(null);

  // The day's stops and date: the leave time is worked back from them.
  const [stops, setStops] = useState<DayStop[]>([]);
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    Promise.all([
      supabase.from("days").select("date").eq("id", dayId).maybeSingle(),
      supabase.from("cards").select("start_time, end_time, details, place:places ( title, lat, lng )").eq("day_id", dayId).eq("status", "in_itinerary"),
    ]).then(([d, c]) => {
      if (off) return;
      setDate(((d.data as { date?: string } | null)?.date) ?? null);
      const rows = (c.data ?? []) as unknown as { start_time: string | null; end_time: string | null; details: Record<string, unknown> | null; place: { title: string | null; lat: number | null; lng: number | null } | null }[];
      setStops(rows.map((r) => ({
        title: (typeof r.details?.title === "string" ? r.details.title : null) ?? r.place?.title ?? null,
        start_time: r.start_time, end_time: r.end_time, lat: r.place?.lat ?? null, lng: r.place?.lng ?? null,
      })));
    });
    return () => { off = true; };
  }, [supabase, dayId]);

  // Drive and transit times, once both ends are known.
  const [estimate, setEstimate] = useState<LegEstimate | null>(null);
  const [asking, setAsking] = useState(false);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!from || !to) return;
    const k = `${from.lat},${from.lng}>${to.lat},${to.lng}`;
    if (asked.current === k) return;
    asked.current = k;
    setEstimate(null);
    setAsking(true);
    fetch("/api/travel/estimate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng }, date, hour: 9 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((e: LegEstimate | null) => { if (asked.current === k) setEstimate(e && (e.drive != null || e.transit != null) ? e : null); })
      .catch(() => { /* no times: the four modes show instead */ })
      .finally(() => { if (asked.current === k) setAsking(false); });
  }, [from, to, date]);

  // Drive, park, walk (14 Nov 2026, step 3): car parks near where you're going,
  // with the drive to each and the walk from it. Not for a car park or station.
  const [parks, setParks] = useState<Park[]>([]);
  const [parkIdx, setParkIdx] = useState(0);
  const parkAsked = useRef<string | null>(null);
  useEffect(() => {
    if (!from || !to || isParkOrStation(to.title)) { setParks([]); return; }
    const k = `${from.lat},${from.lng}>${to.lat},${to.lng}`;
    if (parkAsked.current === k) return;
    parkAsked.current = k;
    setParks([]); setParkIdx(0);
    fetch("/api/travel/park", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng } }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((out: { parks?: Park[] } | null) => { if (parkAsked.current === k) setParks(out?.parks ?? []); })
      .catch(() => { /* no car parks: the drive goes to the door */ });
  }, [from, to]);
  const park = parks[parkIdx] ?? null;

  const ways: Way[] = useMemo(() => {
    const w: Way[] = [];
    if (park) w.push({ key: "park", mode: "drive", mins: parkMinutes(park), extra: "" });
    if (estimate?.drive != null) w.push({ key: "drive", mode: "drive", mins: estimate.drive, extra: "" });
    if (estimate?.transit != null) w.push({ key: estimate.via ?? "train", mode: estimate.via ?? "train", mins: estimate.transit, extra: changesLabel(estimate.rides) });
    return w;
  }, [estimate, park]);

  // Which way is picked: "park", or a mode. A car park within a 15-minute walk
  // leads (driving into an old town is the wrong default); otherwise the first.
  const [choice, setChoice] = useState<string | null>(null);
  const firstPark = parks[0] ?? null;
  useEffect(() => {
    setChoice(firstPark && firstPark.walk <= 15 ? "park" : (ways.find((w) => w.key !== "park")?.key ?? ways[0]?.key ?? null));
    // Only when what is on offer changes, not when a different car park is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate, firstPark]);
  const picked = ways.find((w) => w.key === choice) ?? null;
  const mode: LegMode | null = picked ? picked.mode : (choice && choice !== "park" ? (choice as LegMode) : null);
  const setMode = (m: LegMode) => setChoice(m);
  const mins = picked?.mins ?? null;

  const [leaveTyped, setLeaveTyped] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const plan: LeavePlan | null = to
    ? (leaveTyped ? withLeave(leaveTyped, mins) : planLeave(stops, { lat: to.lat, lng: to.lng }, mins))
    : null;

  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!from || !to || !plan || saving) return;
    setSaving(true);
    try {
      const user = await getAuthUser(supabase);
      if (!user) throw new Error("auth");
      const placeId = await travelEnd(supabase, user.id, to);
      const title = `${from.title} → ${to.title}`;
      const details: Record<string, unknown> = { from, named: true, title };
      if (mode) details.mode = mode;
      if (choice === "park" && park) details.park = park;
      if (estimate) details.estimate = estimate;
      if (to.google_place_id) details.to_google_place_id = to.google_place_id;
      const card = {
        id: crypto.randomUUID(), day_id: dayId, list_id: null, trip_id: tripId,
        start_time: `${plan.leave}:00`, end_time: plan.arrive ? `${plan.arrive}:00` : null,
        position: endPosition, status: "in_itinerary" as const, source_url: null, details, place_id: placeId,
      };
      const { error } = await supabase.from("cards").insert(card);
      if (error) throw new Error("card");
      const place = {
        id: placeId, title: to.title, type: "logistics", sub_type: "transit", lat: to.lat, lng: to.lng,
        address: to.address ?? null, google_place_id: to.google_place_id ?? null, cover_image_url: null, rating: null, price_level: null,
      } as Place;
      onCardCreated({ ...card, ai_generated: false, confirmed: false, created_at: new Date().toISOString(), place } as unknown as Card);
      toast({
        message: dayLabel ? `Added ${title} to ${dayLabel}` : `Added ${title}`,
        undo: onCardRemoved
          ? async () => {
              const { error: delErr } = await queuedDelete("cards", { id: card.id });
              if (delErr) { toast({ message: "Couldn't take that off. Try again." }); return; }
              onCardRemoved(card.id);
            }
          : undefined,
      });
      onClose();
    } catch {
      setSaving(false);
      toast({ message: "Couldn't add that. Try again." });
    }
  };

  const picking = !!to && editing === null;
  const heading = picking ? "Add travel" : "Where to?";

  return (
    <div className="fixed inset-0 z-60 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="add-travel">
      <div className="absolute inset-0 bg-black/30" />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col"
        style={{ willChange: "transform" }}
      >
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onBack} aria-label="Back" className="relative -ml-2 w-9 h-9 rounded-full flex items-center justify-center hover:bg-[rgba(26,26,46,0.06)]">
              <span aria-hidden="true" className="absolute -inset-1" />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
            </button>
            <h2 className="font-display italic" style={{ fontSize: "23px", fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>{heading}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-[rgba(26,26,46,0.06)]">
            <span aria-hidden="true" className="absolute -inset-1" />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* Where to: any place. The start is already there. */}
          {(!to || editing === "to") && (
            <>
              <LegFromSearch
                value={null}
                onPick={(t) => { setTo(t); setEditing(null); setLeaveTyped(null); }}
                biasLat={biasLat}
                biasLng={biasLng}
                placeholder="Search a place, town or station"
              />
              {editing !== "to" && (
                <p className="mt-1 text-[12.5px]" style={{ color: CAP }} data-testid="add-travel-from">
                  {from ? <>From <b className="font-semibold" style={{ color: INK }}>{from.title}</b>{!fromPick && lastNight ? " · last night’s stay" : ""} · </> : null}
                  <button type="button" onClick={() => setEditing("from")} className="relative underline underline-offset-2" style={{ color: from ? CAP : INK }}>
                    <span aria-hidden="true" className="absolute -inset-y-[13px] -inset-x-2" />
                    {from ? "change" : "Where you leave from"}
                  </button>
                </p>
              )}
            </>
          )}
          {editing === "from" && (
            <LegFromSearch
              value={from}
              suggestion={lastNight}
              onPick={(f) => { setFromPick(f); setEditing(null); setLeaveTyped(null); }}
              biasLat={biasLat}
              biasLng={biasLng}
            />
          )}

          {/* Both ends known: pick the way; the times follow. */}
          {picking && (
            <>
              <LegRoute
                from={from}
                fromAddress={from?.address ?? null}
                toTitle={to.title}
                toAddress={to.address ?? null}
                open={null}
                onOpen={(w) => setEditing(w)}
              />
              <div className="mt-4 flex flex-col gap-2" data-testid="add-travel-ways">
                {asking && <p className="text-[13px]" style={{ color: CAP }}>Working out the times…</p>}
                {!asking && ways.map((w) => {
                  const on = w.key === choice;
                  const isPark = w.key === "park" && park;
                  return (
                    <div
                      key={w.key}
                      className="rounded-2xl"
                      style={{ boxShadow: on ? `inset 0 0 0 2px ${INK}` : "inset 0 0 0 1px rgba(26,26,46,0.14)" }}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setChoice(w.key)}
                        className="w-full text-left px-4 pt-3 pb-3"
                      >
                        <span className="flex items-center justify-between text-[15px] font-semibold" style={{ color: INK }}>
                          <span>{isPark ? "🚗 Drive, park, walk" : `${MODE_EMOJI[w.mode]} ${MODE_WORD[w.mode]}`}</span>
                          <span>{estimateLabel(planMinutes(w.mins))}</span>
                        </span>
                        {isPark ? (
                          <span className="block mt-1 text-[12.5px] leading-snug" style={{ color: CAP }} data-testid="add-travel-park">
                            <b className="font-medium" style={{ color: INK }}>{park.drive} min drive</b> → park at <b className="font-medium" style={{ color: INK }}>{park.title}</b> → <b className="font-medium" style={{ color: INK }}>{park.walk} min walk</b>
                          </span>
                        ) : w.extra ? (
                          <span className="block mt-0.5 text-[12.5px]" style={{ color: CAP }}>{w.extra}</span>
                        ) : null}
                      </button>
                      {isPark && (parks.length > 1 || inItaly(to.address)) && (
                        <div className="px-4 pb-3 -mt-1">
                          {inItaly(to.address) && <p className="text-[11.5px] leading-snug" style={{ color: "#B0541F" }} data-testid="add-travel-ztl">{ZTL_LINE}</p>}
                          {parks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => { setParkIdx((i) => (i + 1) % parks.length); setChoice("park"); }}
                              className="relative mt-1 text-[12px] underline underline-offset-2"
                              style={{ color: "rgba(26,26,46,0.5)" }}
                            >
                              <span aria-hidden="true" className="absolute -inset-y-[13px] -inset-x-2" />
                              Different car park
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!asking && ways.length === 0 && (
                  <>
                    <p className="text-[12.5px]" style={{ color: CAP }}>No travel times for this one. How are you going?</p>
                    <LegModePicker value={mode} onChange={setMode} />
                  </>
                )}
              </div>

              {plan && (
                <div className="mt-4 py-3 flex items-baseline justify-between gap-3" style={{ borderTop: "1px solid rgba(26,26,46,0.08)", borderBottom: "1px solid rgba(26,26,46,0.08)" }} data-testid="add-travel-leave">
                  <span className="text-[14px]" style={{ color: INK }}>
                    Leave <b className="font-semibold">{formatTimeValue(plan.leave)}</b>
                    {plan.why && (
                      <span className="text-[12.5px]" style={{ color: CAP }}>
                        {plan.why.kind === "arrive_by" ? ` · arrive by ${formatTimeValue(plan.why.at)} for ${plan.why.title}` : ` · after ${plan.why.title}`}
                      </span>
                    )}
                  </span>
                  {timeOpen ? (
                    <input
                      type="time"
                      autoFocus
                      defaultValue={plan.leave}
                      onChange={(e) => { if (e.target.value) setLeaveTyped(e.target.value); }}
                      onBlur={() => setTimeOpen(false)}
                      className="text-[14px] rounded-md px-1.5 py-0.5"
                      style={{ background: "#F3F4F6", color: INK }}
                      aria-label="Leave at"
                    />
                  ) : (
                    <button type="button" onClick={() => setTimeOpen(true)} className="relative text-[12px] underline underline-offset-2 flex-shrink-0" style={{ color: "rgba(26,26,46,0.5)" }} aria-label="Change when you leave">
                      <span aria-hidden="true" className="absolute -inset-y-[14px] -inset-x-2" />
                      change
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => void add()}
                disabled={saving || asking || !from}
                className="mt-5 w-full rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-50"
                style={{ background: INK }}
              >
                {saving ? "Adding…" : `Add${mode ? ` ${MODE_WORD[mode].toLowerCase()}` : ""}${plan ? ` · ${formatTimeValue(plan.leave)}${plan.arrive ? ` – ${formatTimeValue(plan.arrive)}` : ""}` : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The place a new travel card ends at. A station / car park / port already
 * saved as transit is reused. Anything else (a villa, a restaurant, a town)
 * gets a travel end of its own at the same spot, with no Google id, so the
 * saved place is never retyped: the villa stays a hotel.
 */
async function travelEnd(supabase: ReturnType<typeof createClient>, userId: string, to: LegFrom): Promise<string> {
  if (to.google_place_id) {
    const { data: existing } = await supabase
      .from("places").select("id, type, sub_type").eq("user_id", userId).eq("google_place_id", to.google_place_id).maybeSingle();
    const row = existing as { id: string; type: string | null; sub_type: string | null } | null;
    if (row && row.type === "logistics" && row.sub_type === "transit") return row.id;
    if (!row && isTransitName(to.title)) {
      const { data, error } = await supabase.from("places").insert({
        user_id: userId, google_place_id: to.google_place_id, title: to.title, type: "logistics", sub_type: "transit",
        lat: to.lat, lng: to.lng, address: to.address ?? null,
      }).select("id").single();
      if (!error && data) return (data as { id: string }).id;
    }
  }
  const { data, error } = await supabase.from("places").insert({
    user_id: userId, google_place_id: null, title: to.title, type: "logistics", sub_type: "transit",
    lat: to.lat, lng: to.lng, address: to.address ?? null,
    details: to.google_place_id ? { travel_end_of: to.google_place_id } : null,
  }).select("id").single();
  if (error || !data) throw new Error("place");
  return (data as { id: string }).id;
}

/** A station, car park, port or stop by its name: it can be the shared transit place. */
export const isTransitName = isParkOrStation;
