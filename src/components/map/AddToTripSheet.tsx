"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType, Day, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay } from "@/lib/scheduleCard";
import { PIN_COLORS } from "@/lib/mapPins";
import CardImage from "@/components/ui/CardImage";

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  website?: string;
  mapsUrl?: string;
  coverPhotoUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  phone?: string;
  openNow?: boolean;
  todayHours?: string;
  // Forwarded straight from the Google details response so the places row can
  // carry the same world facts the bulk-import path writes. hours = raw
  // opening_hours object; details = the full raw Google details result.
  hours?: unknown;
  details?: unknown;
}

interface Props {
  place: PlaceResult;
  tripId: string;
  /**
   * The journey's days, so a place can go straight onto one instead of landing
   * in the saved pile for a second trip through the app later. Empty is fine —
   * the day row simply doesn't render and every save is map-only.
   */
  days: Day[];
  onClose: () => void;
  onCardCreated: (card: Card) => void;
}

const TYPE_OPTIONS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity" },
  { type: "food",      label: "Food"     },
  { type: "logistics", label: "Logistics" },
];

const SUB_TYPE_OPTIONS: Record<CardType, { label: string; value: string }[]> = {
  activity: [
    { label: "Guided",        value: "guided"        },
    { label: "Self-directed", value: "self_directed"  },
    { label: "Wellness",      value: "wellness"       },
    { label: "Event",         value: "event"          },
    { label: "Beach",         value: "beach"          },
  ],
  food: [
    { label: "Restaurant", value: "restaurant" },
    { label: "Coffee",     value: "coffee"     },
    { label: "Dessert",    value: "dessert"    },
    { label: "Bar",        value: "bar"        },
  ],
  logistics: [
    { label: "Hotel",   value: "hotel"          },
    { label: "Flight",  value: "flight_arrival" },
    { label: "Transit", value: "transit"        },
    { label: "Grocery", value: "grocery"        },
    { label: "Medical", value: "medical"        },
  ],
};

const DEFAULT_SUB_TYPE: Record<CardType, string> = {
  activity:  "guided",
  food:      "restaurant",
  logistics: "hotel",
};

const KEYWORD_RULES: { pattern: RegExp; subType: string; forTypes: CardType[] }[] = [
  { pattern: /airport|aeroporto|fco|cia|terminal/i,         subType: "flight_arrival",  forTypes: ["logistics"] },
  { pattern: /hotel|b&b|hostel|inn|suites/i,                subType: "hotel",           forTypes: ["logistics"] },
  { pattern: /station|termini|train|bus/i,                  subType: "hotel",           forTypes: ["logistics"] },
  { pattern: /massage|spa|wellness|reflexology/i,           subType: "wellness",        forTypes: ["activity"]  },
  { pattern: /cooking class|corso/i,                        subType: "guided",          forTypes: ["activity"]  },
  { pattern: /caff[eè]|caffe|coffee|gelato|espresso/i,      subType: "coffee",          forTypes: ["food"]      },
  { pattern: /\bbar\b|cocktail|aperitivo/i,                 subType: "bar",             forTypes: ["food"]      },
];

function suggestSubType(name: string, type: CardType): string {
  for (const rule of KEYWORD_RULES) {
    if (rule.forTypes.includes(type) && rule.pattern.test(name)) return rule.subType;
  }
  return DEFAULT_SUB_TYPE[type];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={rating >= i - 0.25 ? "#F59E0B" : "none"} stroke="#F59E0B" strokeWidth="1.5">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      ))}
    </span>
  );
}

/** "Mon 18" — the weekday is what a traveller actually picks a day by. */
function fmtDayChip(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    day:     "numeric",
  });
}

export default function AddToTripSheet({ place, tripId, days, onClose, onCardCreated }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [type,           setType]           = useState<CardType | null>(null);
  const [subType,        setSubType]        = useState<string | null>(null);
  const [recommendedBy,  setRecommendedBy]  = useState("");
  const [saving,         setSaving]         = useState(false);
  const [showDupConfirm, setShowDupConfirm] = useState(false);
  // null = map only, which is the default: saving a place has never implied
  // committing it to a day, and it still doesn't.
  const [targetDayId,    setTargetDayId]    = useState<string | null>(null);

  const targetDay = days.find((d) => d.id === targetDayId) ?? null;

  // The day strip scrolls by thumb on a phone; a mouse has no horizontal
  // gesture, so a vertical wheel over the strip scrolls it and the arrows
  // nudge it a chip-width at a time. Same treatment as the journey planner's
  // quick-window chips.
  const dayScrollerRef = useRef<HTMLDivElement>(null);
  const handleDayWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = dayScrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal
    el.scrollLeft += e.deltaY;
  }, []);
  const nudgeDays = useCallback((dir: 1 | -1) => {
    dayScrollerRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY;
    dragging.current = true;
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

  function selectType(t: CardType) {
    setType(t);
    if (t === "logistics") {
      // Logistics has too many distinct sub-types to safely default — only
      // pre-pick when a keyword genuinely matches; otherwise let the user choose.
      const matched = KEYWORD_RULES.find(
        (r) => r.forTypes.includes(t) && r.pattern.test(place.name),
      );
      setSubType(matched ? matched.subType : null);
    } else {
      setSubType(suggestSubType(place.name, t));
    }
  }

  // ── Core insert (called both on first save and "Save again") ──
  const performInsert = useCallback(async () => {
    if (!type) return;
    const details: Record<string, unknown> = {};
    if (place.website)        details.website        = place.website;
    if (place.phone)          details.phone          = place.phone;
    if (place.rating)         details.rating         = place.rating;
    if (recommendedBy.trim()) details.recommended_by = recommendedBy.trim();

    // ── Store place_id for all card types (needed for photo carousel) ─
    details.place_id = place.placeId;

    // ── Food cards: enrich with price_level + currency_code ───────
    let foodPriceLevel: number | null = null;
    if (type === "food") {
      try {
        const params = new URLSearchParams({ place_id: place.placeId });
        params.set("lat", String(place.lat));
        params.set("lng", String(place.lng));
        const res = await fetch(`/api/places/food-enrich?${params}`);
        if (res.ok) {
          const enriched = await res.json() as { price_level: number | null; currency_code: string };
          if (enriched.price_level != null) {
            details.price_level = enriched.price_level;
            foodPriceLevel = enriched.price_level;
          }
          details.currency_code = enriched.currency_code;
        }
      } catch {
        // non-critical — card saves without enrichment
      }
    }

    const finalSubType = subType ?? DEFAULT_SUB_TYPE[type];

    // ── Resolve places row: reuse existing (user_id, google_place_id) or insert ──
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: placeRow, error: placeErr } = await supabase
      .from("places")
      .upsert(
        {
          user_id:         user.id,
          google_place_id: place.placeId,
          title:           place.name,
          type,
          sub_type:        finalSubType,
          lat:             place.lat,
          lng:             place.lng,
          address:         place.address,
          website:         place.website ?? null,
          phone:           place.phone ?? null,
          hours:           place.hours ?? null,
          rating:          place.rating ?? null,
          price_level:     foodPriceLevel,
          details:         place.details ?? null,
        },
        { onConflict: "user_id,google_place_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (placeErr || !placeRow) { setSaving(false); return; }

    const joinedPlace: Place = {
      id:              placeRow.id,
      title:           place.name,
      type,
      sub_type:        finalSubType,
      lat:             place.lat,
      lng:             place.lng,
      address:         place.address,
      google_place_id: place.placeId,
      cover_image_url: null,
      rating:          place.rating ?? null,
      price_level:     foodPriceLevel,
    };

    // ── Straight onto a day ──────────────────────────────────────
    // One shared chokepoint writes every scheduled card (status in_itinerary,
    // 1-based position = live max on that day + 1). The pin-popup door and the
    // plan board use the same helper, so the two paths cannot drift apart.
    if (targetDayId) {
      const scheduled = await scheduleCardOnDay(supabase, {
        tripId,
        dayId:     targetDayId,
        placeId:   placeRow.id,
        place:     joinedPlace,
        details,
        sourceUrl: place.mapsUrl ?? null,
      });
      setSaving(false);
      if (scheduled) onCardCreated(scheduled);
      return;
    }

    const newCard: Card = {
      id:              crypto.randomUUID(),
      // Interested cards are unscheduled by rule: day_id null + status interested.
      day_id:          null as unknown as string,
      trip_id:         tripId,
      start_time:      null,
      end_time:        null,
      position:        0,
      status:          "interested",
      source_url:      place.mapsUrl ?? null,
      details,
      ai_generated:    false,
      confirmed:       false,
      created_at:      new Date().toISOString(),
      place_id:        placeRow.id,
      place:           joinedPlace,
    };

    const { error } = await supabase.from("cards").insert({
      id:              newCard.id,
      day_id:          null,
      trip_id:         tripId,
      start_time:      null,
      end_time:        null,
      position:        0,
      status:          "interested",
      source_url:      place.mapsUrl ?? null,
      details,
      place_id:        placeRow.id,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [type, subType, recommendedBy, place, targetDayId, tripId, supabase, onCardCreated]);

  const handleSave = useCallback(async () => {
    if (!type || saving) return;
    if (type === "logistics" && !subType) return;
    setSaving(true);

    // ── Deduplication check ───────────────────────────────────
    // cards carries no title/type columns — those live on places. The old
    // filter errored silently, so the duplicate warning never fired. The
    // honest duplicate signal is "this trip already has a card for this
    // exact Google place".
    const { data: existing } = await supabase
      .from("cards")
      .select("id, place:places!inner(google_place_id)")
      .eq("trip_id", tripId)
      .eq("place.google_place_id", place.placeId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      setShowDupConfirm(true);
      return;
    }

    await performInsert();
  }, [type, subType, saving, supabase, tripId, place, performInsert]);

  const handleSaveAnyway = useCallback(async () => {
    setShowDupConfirm(false);
    setSaving(true);
    await performInsert();
  }, [performInsert]);

  const typeColor = type ? PIN_COLORS[type] : null;
  const canSave   = !!type && !saving && !(type === "logistics" && !subType);

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
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* ── Duplicate confirmation overlay ── */}
        {showDupConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-6 bg-black/20 rounded-t-2xl">
            <div className="bg-white rounded-2xl shadow-sheet p-5 w-full max-w-xs">
              <p className="text-[15px] font-bold text-gray-900 mb-1">Already saved</p>
              <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
                &ldquo;{place.name}&rdquo; is already in your journey. Save it again anyway?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDupConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAnyway}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-activity hover:opacity-80 transition-colors"
                >
                  Save again
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Cover photo */}
        <div className="flex-shrink-0 rounded-t-2xl overflow-hidden" style={{ height: 180 }}>
          <CardImage
            src={place.coverPhotoUrl}
            alt={place.name}
            className="w-full h-full object-cover"
            lat={place.lat}
            lng={place.lng}
            title={place.name}
          />
        </div>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors"
          aria-label="Close"
          style={{ zIndex: 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">

          {/* Place name */}
          <h2 className="text-[20px] font-bold text-gray-900 leading-tight mb-1">{place.name}</h2>

          {/* Rating */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {place.rating !== undefined && (
              <span className="flex items-center gap-1 text-[13px] text-gray-600">
                <StarRating rating={place.rating} />
                <span className="font-semibold">{place.rating.toFixed(1)}</span>
                {place.userRatingsTotal !== undefined && (
                  <span className="text-gray-400">· {place.userRatingsTotal.toLocaleString()} reviews</span>
                )}
              </span>
            )}
          </div>

          {/* Address */}
          {place.address && (
            <p className="text-[13px] text-gray-500 mb-2 leading-snug">{place.address}</p>
          )}

          {/* Hours */}
          {(place.openNow !== undefined || place.todayHours) && (
            <p className="text-[12px] mb-2">
              {place.openNow !== undefined && (
                <span className={`font-bold mr-1.5 ${place.openNow ? "text-green-600" : "text-red-500"}`}>
                  {place.openNow ? "Open now" : "Closed"}
                </span>
              )}
              {place.todayHours && <span className="text-gray-500">{place.todayHours}</span>}
            </p>
          )}

          {/* Phone + website */}
          {(place.phone || place.website) && (
            <div className="flex items-center gap-4 mb-4">
              {place.phone && (
                <a href={`tel:${place.phone}`} className="text-[12px] text-blue-600 hover:underline">
                  {place.phone}
                </a>
              )}
              {place.website && (
                <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:underline truncate max-w-[180px]">
                  {place.website.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              )}
            </div>
          )}

          {/* ── Type pills ── */}
          <div className="flex gap-2 mb-2">
            {TYPE_OPTIONS.map(({ type: t, label }) => {
              const selected = type === t;
              const color    = PIN_COLORS[t];
              return (
                <button
                  key={t}
                  onClick={() => selectType(t)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={
                    selected
                      ? { background: color, color: "white", border: `1px solid ${color}` }
                      : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Sub-type pills — appears instantly when type selected ── */}
          {type && (
            <div className="flex gap-2 flex-wrap mb-3">
              {SUB_TYPE_OPTIONS[type].map(({ label, value }) => {
                const selected = subType === value;
                return (
                  <button
                    key={value}
                    onClick={() => setSubType(value)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                    style={
                      selected
                        ? { background: typeColor!, color: "white", border: `1px solid ${typeColor}` }
                        : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Day strip ── Saving a place and scheduling it used to be two
              separate journeys through the app. The default is still an
              unscheduled pin; picking a day writes it onto the plan in one go. */}
          {days.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] text-gray-400 mb-1.5 ml-0.5">Put it on a day (optional)</p>
              <div className="relative">
                <div
                  ref={dayScrollerRef}
                  onWheel={handleDayWheel}
                  className="flex gap-1.5 overflow-x-auto scrollbar-none pr-6"
                >
                  <button
                    onClick={() => setTargetDayId(null)}
                    className={`flex-shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1.5 border whitespace-nowrap transition-colors ${
                      targetDayId === null
                        ? "bg-[#1A1A2E] text-[#FAF7F2] border-[#1A1A2E]"
                        : "bg-[#F2EDE3] text-[#1A1A2E] border-black/10"
                    }`}
                  >
                    Save to the map only
                  </button>
                  {days.map((d) => {
                    const active = targetDayId === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setTargetDayId(d.id)}
                        className={`flex-shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1.5 border whitespace-nowrap transition-colors ${
                          active
                            ? "bg-[#1A1A2E] text-[#FAF7F2] border-[#1A1A2E]"
                            : "bg-[#F2EDE3] text-[#1A1A2E] border-black/10"
                        }`}
                      >
                        Day {d.day_number}
                        <span className={active ? "opacity-60" : "opacity-40"}> · {fmtDayChip(d.date)}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Right-edge fade — signals there are more days to scroll */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none"
                  style={{ background: "linear-gradient(to left, #fff, transparent)" }}
                />
                {/* A mouse can't swipe a strip: arrows do on desktop what a
                    thumb does on a phone. Hidden on touch, where they'd just
                    cover chips. */}
                <button
                  type="button"
                  onClick={() => nudgeDays(-1)}
                  aria-label="Earlier days"
                  className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm items-center justify-center text-[#1A1A2E]"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => nudgeDays(1)}
                  aria-label="Later days"
                  className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm items-center justify-center text-[#1A1A2E]"
                >
                  ›
                </button>
              </div>
            </div>
          )}

          {/* Recommended by */}
          <div className="mb-4">
            <input
              type="text"
              value={recommendedBy}
              onChange={(e) => setRecommendedBy(e.target.value)}
              placeholder="e.g. Marco, Sarah..."
              className="w-full px-3 py-2 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white transition-colors"
            />
            <p className="text-[11px] text-gray-400 mt-1 ml-0.5">Recommended by (optional)</p>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
              canSave
                ? "text-white active:scale-[0.98] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
            style={canSave ? { background: typeColor! } : undefined}
          >
            {saving
              ? "Checking…"
              : targetDay
              ? `Add to Day ${targetDay.day_number}`
              : "Save to the map only"}
          </button>
        </div>
      </div>
    </div>
  );
}
