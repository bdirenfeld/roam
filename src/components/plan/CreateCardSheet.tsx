"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Card, CardType, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { queuedInsert } from "@/lib/offline/queuedWrite";
import { useToast } from "@/components/ui/Toast";
import { scheduleCardOnDay } from "@/lib/scheduleCard";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import type { PlaceResult } from "@/components/map/AddToTripSheet";

const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "guided",        label: "Guided"        },
    { value: "self_directed", label: "Self-Directed" },
    { value: "wellness",      label: "Wellness"      },
    { value: "event",         label: "Event"         },
    { value: "beach",         label: "Beach"         },
  ],
  food: [
    { value: "restaurant", label: "Restaurant" },
    { value: "coffee",     label: "Coffee"     },
    { value: "dessert",    label: "Dessert"    },
    { value: "bar",        label: "Bar"        },
  ],
  logistics: [
    { value: "flight_arrival",   label: "Flight Arrival"   },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "hotel",            label: "Hotel"            },
    { value: "transit",          label: "Transit"          },
    { value: "grocery",          label: "Grocery"          },
    { value: "medical",          label: "Medical"          },
  ],
};

const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: "activity",  label: "Activity"  },
  { value: "food",      label: "Food"      },
  { value: "logistics", label: "Logistics" },
];

// Google `types` → Roam type. Same spirit as the map's keyword rules, but the
// details response carries real categories so we can pre-pick with confidence.
function inferType(googleTypes: string[], name: string): { type: CardType; subType: string } {
  const t = new Set(googleTypes);
  if (t.has("lodging")) return { type: "logistics", subType: "hotel" };
  if (t.has("airport")) return { type: "logistics", subType: "flight_arrival" };
  if (t.has("transit_station") || t.has("train_station") || t.has("bus_station"))
    return { type: "logistics", subType: "transit" };
  if (t.has("supermarket") || t.has("grocery_or_supermarket"))
    return { type: "logistics", subType: "grocery" };
  if (t.has("pharmacy") || t.has("hospital") || t.has("doctor"))
    return { type: "logistics", subType: "medical" };
  if (t.has("cafe") || /caff[eè]|coffee|espresso/i.test(name)) return { type: "food", subType: "coffee" };
  if (t.has("bakery") || /gelato|dessert|pastel/i.test(name))  return { type: "food", subType: "dessert" };
  if (t.has("bar") || t.has("night_club"))                      return { type: "food", subType: "bar" };
  if (t.has("restaurant") || t.has("meal_takeaway") || t.has("food"))
    return { type: "food", subType: "restaurant" };
  if (t.has("spa") || /massage|spa|wellness/i.test(name)) return { type: "activity", subType: "wellness" };
  if (t.has("beach"))                                     return { type: "activity", subType: "beach" };
  if (t.has("museum") || t.has("art_gallery") || t.has("park") || t.has("tourist_attraction"))
    return { type: "activity", subType: "self_directed" };
  return { type: "activity", subType: "self_directed" };
}

interface Prediction {
  place_id: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

interface Props {
  /**
   * The day this card lands on. `null` writes a dayless card — that is what the
   * Plan board's named lists use, paired with `initialStatus: "interested"` and
   * a `listId`. Everything else about the sheet (Google search, place upsert,
   * type inference) is identical either way.
   */
  dayId: string | null;
  /**
   * The board list this card lands on, or null for a normal day card. Set
   * together with `dayId: null` — a card belongs to a day or a list, never
   * both.
   */
  listId?: string | null;
  tripId: string;
  endPosition: number;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
  initialStatus?: Card["status"];
  /** Merged into the new card's `details`, for callers that seed extra keys. */
  extraDetails?: Record<string, unknown>;
  initialStartTime?: string;
  initialEndTime?: string;
  /** Places already on this day — left out of the saved list. */
  scheduledPlaceIds?: Set<string>;
  /** Bias the Google search toward the journey's destination */
  destination?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
}

export default function CreateCardSheet({
  dayId, listId = null, tripId, endPosition, onClose, onCardCreated,
  initialStatus, extraDetails, initialStartTime, initialEndTime,
  scheduledPlaceIds, destination, destinationLat, destinationLng,
}: Props) {
  const { toast } = useToast();
  const supabase  = createClient();
  // Whole-sheet swipe to dismiss, but never while the list underneath is
  // mid-scroll: the hook finds the nearest scroller and only drags the sheet
  // when that scroller is at the top (hooks/useSheetDrag.ts).
  const drag      = useSheetDrag(onClose);
  const inputRef  = useRef<HTMLInputElement>(null);

  const [title,       setTitle]       = useState("");
  const [type,        setType]        = useState<CardType | null>(null);
  const [subType,     setSubType]     = useState<string | null>(null);
  const [startTime]   = useState(initialStartTime ?? "");
  const [endTime]     = useState(initialEndTime ?? "");
  const [saving,      setSaving]      = useState(false);
  const [autoAdd,     setAutoAdd]     = useState(false);

  // ── Google search state — the title input doubles as the search box ──
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [selected,     setSelected]     = useState<PlaceResult | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout>>();
  const sessionToken = useRef(crypto.randomUUID());

  // ── Saved places — the traveller's own pile, offered before Google ──
  const [saved, setSaved] = useState<Card[]>([]);
  useEffect(() => {
    if (!dayId) return;
    let cancelled = false;
    supabase
      .from("cards")
      .select(`
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours, loved, loved_at
        )
      `)
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .not("place_id", "is", null)
      .then(({ data }) => {
        if (cancelled) return;
        const seen = new Map<string, Card>();
        for (const c of (data ?? []) as Card[]) {
          if (!c.place || !c.place_id) continue;
          if (scheduledPlaceIds?.has(c.place_id)) continue;
          const prev = seen.get(c.place_id);
          if (!prev || (!prev.place?.cover_image_url && c.place.cover_image_url)) seen.set(c.place_id, c);
        }
        setSaved(Array.from(seen.values()).sort((a, b) => (a.place!.title ?? "").localeCompare(b.place!.title ?? "")));
      });
    return () => { cancelled = true; };
    // scheduledPlaceIds is a fresh Set each render; the list is small and the
    // sheet is short-lived, so fetch once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId, tripId, supabase]);

  const savedMatches = useMemo(() => {
    if (!dayId || selected) return [] as Card[];
    const q = title.trim().toLowerCase();
    return q
      ? saved.filter((c) => (c.place!.title ?? "").toLowerCase().includes(q) || (c.place!.address ?? "").toLowerCase().includes(q))
      : saved;
  }, [saved, title, selected, dayId]);
  const savedGroups = useMemo(() => {
    const order: { type: CardType; label: string }[] = [
      { type: "food", label: "Food" },
      { type: "activity", label: "Activity" },
      { type: "logistics", label: "Logistics" },
    ];
    return order
      .map((g) => ({ ...g, cards: savedMatches.filter((c) => c.place!.type === g.type) }))
      .filter((g) => g.cards.length > 0);
  }, [savedMatches]);

  const handleQuickAdd = useCallback(async (card: Card) => {
    if (!dayId || !card.place_id || saving) return;
    setSaving(true);
    const newCard = await scheduleCardOnDay(supabase, {
      tripId,
      dayId,
      placeId: card.place_id,
      place: card.place,
      details: (card.details ?? {}) as Card["details"],
      startTime: startTime ? `${startTime.slice(0, 5)}:00` : null,
      endTime: endTime ? `${endTime.slice(0, 5)}:00` : null,
      sourceUrl: card.source_url,
    });
    setSaving(false);
    if (!newCard) { toast({ message: "Couldn't add that. Try again." }); return; }
    onCardCreated(newCard);
  }, [dayId, tripId, supabase, startTime, endTime, saving, onCardCreated, toast]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced autocomplete while nothing is selected
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (selected || !title.trim() || title.trim().length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ input: title, sessiontoken: sessionToken.current });
        if (destinationLat != null && destinationLng != null) {
          params.set("lat", String(destinationLat));
          params.set("lng", String(destinationLng));
        }
        const res  = await fetch(`/api/places/autocomplete?${params.toString()}`);
        const data = await res.json();
        setPredictions((data.predictions ?? []).slice(0, 5));
      } catch {
        setPredictions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [title, selected, destinationLat, destinationLng]);

  // Prediction → full details (same fields the map's search resolves)
  const handlePick = useCallback(async (p: Prediction) => {
    setPredictions([]);
    setLoadingPlace(true);
    try {
      const res  = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(p.place_id)}&sessiontoken=${encodeURIComponent(sessionToken.current)}`,
      );
      const data = await res.json();
      sessionToken.current = crypto.randomUUID();
      if (!data.result) return;
      const { result } = data;

      let coverPhotoUrl: string | undefined;
      const photoRef = result.photos?.[0]?.photo_reference as string | undefined;
      if (photoRef) {
        try {
          const photoRes  = await fetch(`/api/places/photo/by-reference?photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`);
          const photoData = await photoRes.json();
          if (photoData.url) coverPhotoUrl = photoData.url as string;
        } catch { /* best-effort */ }
      }

      const place: PlaceResult = {
        placeId:          p.place_id,
        name:             result.name,
        address:          result.formatted_address ?? "",
        lat:              result.geometry.location.lat as number,
        lng:              result.geometry.location.lng as number,
        website:          result.website,
        mapsUrl:          result.url,
        coverPhotoUrl,
        rating:           result.rating,
        userRatingsTotal: result.user_ratings_total,
        phone:            result.formatted_phone_number,
        hours:            result.opening_hours ?? null,
        details:          result,
      };
      setSelected(place);
      setTitle(result.name);
      const guess = inferType((result.types as string[]) ?? [], result.name);
      setType(guess.type);
      setSubType(guess.subType);
      // One tap adds it — the same as a saved place (Brennan, from his
      // phone, Sep 2026: "does it make sense that you only have the ability
      // to add it as a note?"). Type and time are fixed on the card after.
      setAutoAdd(true);
    } catch {
      // network error — stay in plain-text mode
    } finally {
      setLoadingPlace(false);
    }
  }, []);

  const clearSelected = useCallback(() => {
    setSelected(null);
    setType(null);
    setSubType(null);
    setTitle("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);

    const cardStatus   = initialStatus ?? "in_itinerary";
    const startTimeFmt = startTime ? `${startTime.slice(0, 5)}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime.slice(0, 5)}:00`   : null;
    const cardId       = crypto.randomUUID();
    // cards.day_id is nullable in the database but typed non-null on Card. A
    // card on a list genuinely has no day, so the cast happens once, here.
    const cardDayId    = dayId as unknown as string;

    // ── Real place selected: same write path as the map's AddToTripSheet —
    //    upsert the enriched places row, then a card referencing it ──
    if (selected && type) {
      const details: Record<string, unknown> = { ...extraDetails, place_id: selected.placeId };
      if (selected.website) details.website = selected.website;
      if (selected.phone)   details.phone   = selected.phone;
      if (selected.rating)  details.rating  = selected.rating;

      let foodPriceLevel: number | null = null;
      if (type === "food") {
        try {
          const params = new URLSearchParams({ place_id: selected.placeId });
          params.set("lat", String(selected.lat));
          params.set("lng", String(selected.lng));
          const res = await fetch(`/api/places/food-enrich?${params}`);
          if (res.ok) {
            const enriched = await res.json() as { price_level: number | null; currency_code: string };
            if (enriched.price_level != null) {
              details.price_level = enriched.price_level;
              foodPriceLevel = enriched.price_level;
            }
            details.currency_code = enriched.currency_code;
          }
        } catch { /* non-critical */ }
      }

      const finalSubType = subType ?? SUB_TYPES[type][0].value;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: placeRow, error: placeErr } = await supabase
        .from("places")
        .upsert(
          {
            user_id:         user.id,
            google_place_id: selected.placeId,
            title:           selected.name,
            type,
            sub_type:        finalSubType,
            lat:             selected.lat,
            lng:             selected.lng,
            address:         selected.address,
            website:         selected.website ?? null,
            phone:           selected.phone ?? null,
            hours:           selected.hours ?? null,
            rating:          selected.rating ?? null,
            price_level:     foodPriceLevel,
            details:         selected.details ?? null,
          },
          { onConflict: "user_id,google_place_id", ignoreDuplicates: false },
        )
        .select("id")
        .single();

      if (placeErr || !placeRow) { setSaving(false); return; }

      const { error } = await supabase.from("cards").insert({
        id: cardId, day_id: cardDayId, list_id: listId, trip_id: tripId,
        start_time: startTimeFmt, end_time: endTimeFmt,
        position: endPosition, status: cardStatus,
        source_url: selected.mapsUrl ?? null,
        details, place_id: placeRow.id,
      });
      setSaving(false);
      if (error) { toast({ message: "Couldn't add that. Try again." }); return; }

      const joinedPlace: Place = {
        id:              placeRow.id,
        title:           selected.name,
        type,
        sub_type:        finalSubType,
        lat:             selected.lat,
        lng:             selected.lng,
        address:         selected.address,
        google_place_id: selected.placeId,
        cover_image_url: null,
        rating:          selected.rating ?? null,
        price_level:     foodPriceLevel,
      };
      onCardCreated({
        id: cardId, day_id: cardDayId, list_id: listId, trip_id: tripId,
        start_time: startTimeFmt, end_time: endTimeFmt,
        position: endPosition, status: cardStatus,
        source_url: selected.mapsUrl ?? null,
        details, ai_generated: false, confirmed: false,
        created_at: new Date().toISOString(),
        place_id: placeRow.id, place: joinedPlace,
      });
      return;
    }

    // ── No place: a plain text card (a note on the timeline) ──
    const details: Record<string, unknown> = { ...extraDetails, title: title.trim() };
    // A plain note needs nothing from the network, so it queues offline.
    const { error } = await queuedInsert("cards", {
      id: cardId, day_id: cardDayId, list_id: listId, trip_id: tripId,
      start_time: startTimeFmt, end_time: endTimeFmt,
      position: endPosition, status: cardStatus,
      details, ai_generated: false,
      place_id: null,
    });
    setSaving(false);
    if (error) { toast({ message: "Couldn't add that. Try again." }); return; }
    onCardCreated({
      id: cardId, day_id: cardDayId, list_id: listId, trip_id: tripId,
      start_time: startTimeFmt, end_time: endTimeFmt,
      position: endPosition, status: cardStatus,
      source_url: null, details, ai_generated: false,
      confirmed: false, created_at: new Date().toISOString(),
      place_id: null, place: null,
    });
  }, [
    title, startTime, endTime, saving, selected, type, subType,
    dayId, listId, tripId, endPosition, initialStatus, extraDetails, supabase, onCardCreated, toast,
  ]);

  const canCreate = title.trim().length > 0 && !loadingPlace;

  useEffect(() => {
    if (!autoAdd || !selected || !type || saving) return;
    setAutoAdd(false);
    void handleCreate();
  }, [autoAdd, selected, type, saving, handleCreate]);

  const pillStyle = (isSelected: boolean): React.CSSProperties => isSelected
    ? { background: "#1A1A2E", color: "white", border: "1px solid #1A1A2E" }
    : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" };

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <h2
            className="font-display italic"
            style={{ fontSize: "23px", fontWeight: 500, color: "#1A1A2E", letterSpacing: "-0.01em" }}
          >
            {dayId ? "Add to this day" : "Add to this list"}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(26,26,46,0.06)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-safe">
          {/* Search / title input — one box does both */}
          {!selected && (
            <>
              <div className="flex items-center gap-2.5 mb-3 px-3.5 py-2.5 rounded-full" style={{ background: "#F3F4F6" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canCreate && predictions.length === 0) handleCreate(); }}
                  placeholder={saved.length > 0 ? "Search saved places, or anywhere" : (destination ? `Search ${destination}, or type a note…` : "Search a place, or type a note…")}
                  className="flex-1 text-[15px] text-[#1A1A2E] placeholder:text-[rgba(26,26,46,0.40)] bg-transparent outline-none py-0.5"
                />
                {(searching || loadingPlace) && (
                  <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                )}
              </div>

              {/* Saved first — one tap puts the place on the day and closes. */}
              {savedGroups.map((g) => (
                <div className="mb-3" key={g.type}>
                  <p className="mb-1.5 px-1 text-[9.5px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: "rgba(26,26,46,0.62)" }}>
                    {g.label} · saved on your map
                  </p>
                  <div className="rounded-xl bg-[#FCFBF8] overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(26,26,46,0.10)" }}>
                    {g.cards.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => handleQuickAdd(c)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70 transition-opacity disabled:opacity-50"
                        style={{ borderBottom: i < g.cards.length - 1 ? "1px solid rgba(26,26,46,0.08)" : "none" }}
                      >
                        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F0EFEB", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-[#1A1A2E] truncate" style={{ letterSpacing: "-0.005em" }}>{c.place!.title}</span>
                          {c.place!.address && (
                            <span className="block text-[11.5px] truncate mt-0.5" style={{ color: "rgba(26,26,46,0.62)" }}>{c.place!.address}</span>
                          )}
                        </span>
                        <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ color: "#1A1A2E", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.12)" }}>
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Predictions — the world beyond the pile. */}
              {predictions.length > 0 && savedMatches.length > 0 && (
                <p className="mb-1.5 px-1 text-[9.5px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: "rgba(26,26,46,0.62)" }}>
                  Everywhere else
                </p>
              )}
              {predictions.length > 0 && (
                <div className="rounded-xl bg-white overflow-hidden mb-3" style={{ boxShadow: "0 0 0 1px rgba(26,26,46,0.10)" }}>
                  {predictions.map((p, i) => (
                    <button
                      key={p.place_id}
                      onClick={() => handlePick(p)}
                      disabled={loadingPlace || saving}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left disabled:opacity-60 ${
                        i < predictions.length - 1 ? "border-b border-gray-50" : ""
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-gray-900 leading-snug truncate">
                          {p.structured_formatting.main_text}
                        </span>
                        {p.structured_formatting.secondary_text && (
                          <span className="block text-[12px] text-gray-400 leading-snug truncate mt-0.5">
                            {p.structured_formatting.secondary_text}
                          </span>
                        )}
                      </div>
                      <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ color: "#1A1A2E", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.12)" }}>
                        Add
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Selected place preview */}
          {selected && (
            <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 mb-4">
              {selected.coverPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.coverPhotoUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-gray-900 leading-snug">{selected.name}</p>
                <p className="text-[12px] text-gray-400 leading-snug truncate mt-0.5">{selected.address}</p>
                {selected.rating && (
                  <p className="text-[12px] text-gray-500 mt-0.5">★ {selected.rating}{selected.userRatingsTotal ? ` (${selected.userRatingsTotal})` : ""}</p>
                )}
              </div>
              <button
                onClick={clearSelected}
                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors flex-shrink-0"
                aria-label="Clear selection"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Type chips — only for a real place (they set the pin + icon) */}
          {selected && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2 mb-2">
                {TYPE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setType(value); setSubType(SUB_TYPES[value][0].value); }}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                    style={pillStyle(type === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {type && (
                <div className="flex flex-wrap gap-2">
                  {SUB_TYPES[type].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSubType(value)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                      style={pillStyle(subType === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add — only once there is something to add: a picked place, or
              typed text that becomes a plain note. No grey button waiting. */}
          {!selected && title.trim().length > 0 && predictions.length > 0 && (
            <div className="pb-8 pt-1 text-center">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || saving}
                className="text-[12.5px] underline underline-offset-2 disabled:opacity-40"
                style={{ color: "rgba(26,26,46,0.62)" }}
              >
                None of these — add &ldquo;{title.trim()}&rdquo; as a note
              </button>
            </div>
          )}
          {(selected || (title.trim().length > 0 && predictions.length === 0)) && (
          <div className="pb-8 pt-1">
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold transition-all active:scale-[0.98]"
              style={canCreate && !saving
                ? { background: "#1A1A2E", color: "white" }
                : { background: "#F3F4F6", color: "#D1D5DB", cursor: "not-allowed" }}
            >
              {saving || loadingPlace ? "Adding…" : selected ? `Add ${selected.name}` : "Add as a note"}
            </button>
          </div>
          )}
          {!selected && title.trim().length === 0 && <div className="pb-6" />}
        </div>
      </div>
    </div>
  );
}
