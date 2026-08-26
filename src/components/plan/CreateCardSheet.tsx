"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
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
  dayId: string;
  tripId: string;
  endPosition: number;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
  initialStatus?: Card["status"];
  initialStartTime?: string;
  initialEndTime?: string;
  /** Bias the Google search toward the journey's destination */
  destination?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
}

export default function CreateCardSheet({
  dayId, tripId, endPosition, onClose, onCardCreated,
  initialStatus, initialStartTime, initialEndTime,
  destination, destinationLat, destinationLng,
}: Props) {
  const supabase  = createClient();
  const sheetRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragY     = useRef(0);
  const dragging  = useRef(false);

  const [title,       setTitle]       = useState("");
  const [type,        setType]        = useState<CardType | null>(null);
  const [subType,     setSubType]     = useState<string | null>(null);
  const [startTime,   setStartTime]   = useState(initialStartTime ?? "");
  const [endTime,     setEndTime]     = useState(initialEndTime ?? "");
  const [saving,      setSaving]      = useState(false);

  // ── Google search state — the title input doubles as the search box ──
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [selected,     setSelected]     = useState<PlaceResult | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout>>();
  const sessionToken = useRef(crypto.randomUUID());

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY; dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform  = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform  = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }, [onClose]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);

    const cardStatus   = initialStatus ?? "in_itinerary";
    const startTimeFmt = startTime ? `${startTime.slice(0, 5)}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime.slice(0, 5)}:00`   : null;
    const cardId       = crypto.randomUUID();

    // ── Real place selected: same write path as the map's AddToTripSheet —
    //    upsert the enriched places row, then a card referencing it ──
    if (selected && type) {
      const details: Record<string, unknown> = { place_id: selected.placeId };
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
        id: cardId, day_id: dayId, trip_id: tripId,
        start_time: startTimeFmt, end_time: endTimeFmt,
        position: endPosition, status: cardStatus,
        source_url: selected.mapsUrl ?? null,
        details, place_id: placeRow.id,
      });
      setSaving(false);
      if (error) { console.error("[CreateCardSheet] card insert failed:", error); return; }

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
        id: cardId, day_id: dayId, trip_id: tripId,
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
    const details: Record<string, unknown> = { title: title.trim() };
    const { error } = await supabase.from("cards").insert({
      id: cardId, day_id: dayId, trip_id: tripId,
      start_time: startTimeFmt, end_time: endTimeFmt,
      position: endPosition, status: cardStatus,
      details, ai_generated: false,
      place_id: null,
    });
    setSaving(false);
    if (error) { console.error("[CreateCardSheet] card insert failed:", error); return; }
    onCardCreated({
      id: cardId, day_id: dayId, trip_id: tripId,
      start_time: startTimeFmt, end_time: endTimeFmt,
      position: endPosition, status: cardStatus,
      source_url: null, details, ai_generated: false,
      confirmed: false, created_at: new Date().toISOString(),
      place_id: null, place: null,
    });
  }, [
    title, startTime, endTime, saving, selected, type, subType,
    dayId, tripId, endPosition, initialStatus, supabase, onCardCreated,
  ]);

  const canCreate = title.trim().length > 0 && !loadingPlace;

  const pillStyle = (isSelected: boolean): React.CSSProperties => isSelected
    ? { background: "#1A1A2E", color: "white", border: "1px solid #1A1A2E" }
    : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" };

  const INPUT_CLS =
    "w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-gray-300 focus:bg-white transition-colors";

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">Add to this day</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
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
              <div className="flex items-center gap-2 mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canCreate && predictions.length === 0) handleCreate(); }}
                  placeholder={destination ? `Search ${destination}, or type a note…` : "Search a place, or type a note…"}
                  className="flex-1 text-[17px] font-bold text-gray-900 placeholder-gray-300 bg-transparent outline-none py-1"
                />
                {(searching || loadingPlace) && (
                  <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                )}
              </div>

              {/* Predictions */}
              {predictions.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden mb-3" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                  {predictions.map((p, i) => (
                    <button
                      key={p.place_id}
                      onClick={() => handlePick(p)}
                      className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
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
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-300 mb-4">
                Pick a match to get the pin, photo and hours — or just press Add for a plain note.
              </p>
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

          {/* Time */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Start time</p>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">End time</p>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Add button */}
          <div className="pb-8 pt-1">
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold transition-all active:scale-[0.98]"
              style={canCreate && !saving
                ? { background: "#1A1A2E", color: "white" }
                : { background: "#F3F4F6", color: "#D1D5DB", cursor: "not-allowed" }}
            >
              {saving ? "Adding…" : selected ? `Add ${selected.name}` : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
