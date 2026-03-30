"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Card, Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import LinkPlaceSheet from "@/components/plan/LinkPlaceSheet";

// ── Type-specific detail components ───────────────────────────
import FlightArrivalDetail from "./detail/FlightArrivalDetail";
import CoffeeDetail from "./detail/CoffeeDetail";
import CocktailBarDetail from "./detail/CocktailBarDetail";
import RestaurantDetail from "./detail/RestaurantDetail";
import SelfDirectedDetail from "./detail/SelfDirectedDetail";
import GuidedDetail from "./detail/GuidedDetail";
import EventDetail from "./detail/EventDetail";
import ChallengeDetail from "./detail/ChallengeDetail";

// Legacy fallback components (for sub_types not yet migrated)
import LogisticsDetail from "./detail/LogisticsDetail";
import ActivityDetail from "./detail/ActivityDetail";
import HotelDetail from "./detail/HotelDetail";

interface Props {
  card: Card;
  onClose: () => void;
  /** Called after every successful (or optimistically applied) edit. */
  onCardUpdate?: (card: Card) => void;
  /** Called after the card is permanently deleted. */
  onCardDelete?: (cardId: string) => void;
  /** Days available for assignment (shows "Assign to Day" when card is interested) */
  days?: Day[];
}

// ── Sub-type display labels ────────────────────────────────────
const SUB_TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
  self_directed:    "Self-Directed",
  guided:           "Guided Experience",
  hosted:           "Guided Experience",
  wellness:         "Wellness",
  event:            "Event",
  challenge:        "Challenge",
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee & Pastry",
  cocktail_bar:     "Cocktail Bar",
  drinks:           "Drinks",
  note:             "Note",
};

// ── Type accent colours ────────────────────────────────────────
const TYPE_ACCENT: Record<string, { dot: string; bg: string; text: string }> = {
  logistics: { dot: "bg-logistics", bg: "bg-slate-50",  text: "text-logistics" },
  activity:  { dot: "bg-activity",  bg: "bg-teal-50",   text: "text-activity"  },
  food:      { dot: "bg-food",      bg: "bg-amber-50",  text: "text-food"      },
};

// ── Booking badge ──────────────────────────────────────────────
function bookingBadge(details: Record<string, unknown>) {
  const status = details.reservation_status as string | undefined;
  const refundable = details.refundable as boolean | undefined;
  if (status === "reserved") return { label: "Reserved", classes: "bg-green-50 text-green-600 border-green-100" };
  if (details.supplier)      return { label: refundable === false ? "Booked · Non-refundable" : "Booked", classes: "bg-teal-50 text-activity border-teal-100" };
  if (status === "walk-in")  return { label: "Walk-in", classes: "bg-gray-50 text-gray-500 border-gray-100" };
  return null;
}

// ── Time helpers ───────────────────────────────────────────────
function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

function durationLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Note detail (free-form textarea) ─────────────────────────
function NoteDetail({ notes, onSave }: { notes: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(notes);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== notes) onSave(draft); }}
      placeholder="Start writing…"
      className="w-full min-h-[200px] text-[14px] text-gray-700 placeholder-gray-300 resize-none outline-none bg-transparent leading-relaxed"
    />
  );
}

// ── Inline title editor ───────────────────────────────────────
function TitleEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  };

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="w-full text-[19px] font-bold text-gray-900 leading-snug bg-gray-50 rounded-md px-1 py-0.5 outline-none border border-gray-200 focus:border-blue-300"
    />
  ) : (
    <h2
      onClick={() => setEditing(true)}
      className="text-[19px] font-bold text-gray-900 leading-snug cursor-pointer hover:bg-gray-50 rounded-md -mx-1 px-1 py-0.5 transition-colors"
    >
      {value}
    </h2>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function CardBottomSheet({ card, onClose, onCardUpdate, onCardDelete, days }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const isDragging = useRef(false);

  // Local optimistic state
  const [localCard, setLocalCard] = useState<Card>(card);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Keyboard escape ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Body scroll lock ───────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Drag-to-dismiss ────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || !sheetRef.current) return;
      isDragging.current = false;
      const dy = e.changedTouches[0].clientY - dragY.current;
      if (dy > 120) {
        sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
        sheetRef.current.style.transform = "translateY(100%)";
        setTimeout(onClose, 240);
      } else {
        sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
    },
    [onClose]
  );

  // ── Persistence helpers ───────────────────────────────────
  const saveTopLevel = useCallback(
    async (field: string, value: unknown) => {
      const prev = localCard;
      const updated = { ...localCard, [field]: value };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await supabase
        .from("cards")
        .update({ [field]: value })
        .eq("id", localCard.id);

      if (error) {
        console.error("Failed to save", field, error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase]
  );

  const saveDetails = useCallback(
    async (field: string, value: unknown) => {
      // "__top__" prefix routes to a top-level column update instead
      if (field.startsWith("__top__")) {
        return saveTopLevel(field.replace("__top__", ""), value);
      }

      const prev = localCard;
      const newDetails = { ...localCard.details, [field]: value };
      const updated = { ...localCard, details: newDetails };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await supabase
        .from("cards")
        .update({ details: newDetails })
        .eq("id", localCard.id);

      if (error) {
        console.error("Failed to save details.", field, error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, saveTopLevel, supabase]
  );

  // ── Link place from map ───────────────────────────────────────
  const handleLinkPlace = useCallback(async (place: Card) => {
    setShowLinkSheet(false);
    const placeDetails = place.details as Record<string, unknown> | null;

    // Merge all place details into the skeleton
    const mergedDetails = {
      ...(placeDetails ?? {}),
      // Ensure typed fields are present with correct types
      ...(typeof placeDetails?.website        === "string" ? { website:        placeDetails.website        } : {}),
      ...(typeof placeDetails?.phone          === "string" ? { phone:          placeDetails.phone          } : {}),
      ...(typeof placeDetails?.rating         === "number" ? { rating:         placeDetails.rating         } : {}),
      ...(typeof placeDetails?.place_id       === "string" ? { place_id:       placeDetails.place_id       } : {}),
      ...(typeof placeDetails?.recommended_by === "string" ? { recommended_by: placeDetails.recommended_by } : {}),
    };

    // Skeleton card absorbs ALL real place data (keeps its id/day_id/position in Kanban)
    const updated: Card = {
      ...localCard,
      title:           place.title,
      type:            place.type,
      sub_type:        place.sub_type,
      lat:             place.lat,
      lng:             place.lng,
      address:         place.address,
      cover_image_url: place.cover_image_url,
      source_url:      place.source_url,
      details:         mergedDetails,
    };

    setLocalCard(updated);
    onCardUpdate?.(updated);

    // Persist all inherited fields to the skeleton card
    await supabase.from("cards").update({
      title:           place.title,
      type:            place.type,
      sub_type:        place.sub_type,
      lat:             place.lat,
      lng:             place.lng,
      address:         place.address,
      cover_image_url: place.cover_image_url,
      source_url:      place.source_url,
      details:         mergedDetails,
    }).eq("id", localCard.id);

    // Remove the now-absorbed interested pin — the skeleton card (which is already
    // in_itinerary with lat/lng) will render as a solid pin on the map
    await supabase.from("cards").delete().eq("id", place.id);
  }, [localCard, onCardUpdate, supabase]);

  // ── Delete card ──────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const { error } = await supabase.from("cards").delete().eq("id", localCard.id);
    setIsDeleting(false);
    if (error) {
      setDeleteError("Couldn't delete — please try again.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }
    onCardDelete?.(localCard.id);
    onClose();
  }, [localCard.id, onCardDelete, onClose, supabase]);

  // ── Assign to day ─────────────────────────────────────────
  const handleAssignToDay = useCallback(
    async (day: Day) => {
      setShowDayPicker(false);
      const prev = localCard;
      const updated = { ...localCard, day_id: day.id, status: "in_itinerary" as Card["status"] };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await supabase
        .from("cards")
        .update({ day_id: day.id, status: "in_itinerary" })
        .eq("id", localCard.id);

      if (error) {
        console.error("Failed to assign to day", error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase],
  );

  // ── Derived display values ─────────────────────────────────
  const isNote    = localCard.sub_type === "note";
  const accent    = isNote ? { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" }
                           : (TYPE_ACCENT[localCard.type] ?? TYPE_ACCENT.logistics);
  const typeLabel = SUB_TYPE_LABEL[localCard.sub_type ?? ""] ?? localCard.type;
  const rating    = typeof (localCard.details as Record<string, unknown>)?.rating === "number"
                      ? ((localCard.details as Record<string, unknown>).rating as number)
                      : null;

  const timeRange = (() => {
    const s = formatTime(localCard.start_time);
    const e = formatTime(localCard.end_time);
    if (s && e) return `${s} – ${e}`;
    if (s) return s;
    return null;
  })();
  const duration = durationLabel(localCard.start_time, localCard.end_time);
  const badge = bookingBadge(localCard.details);

  // ── Route to sub-type component ───────────────────────────
  const key = `${localCard.type}/${localCard.sub_type ?? ""}`;

  function renderDetail() {
    switch (key) {
      case "logistics/flight_arrival":
        return <FlightArrivalDetail card={localCard} onSaveDetails={saveDetails} />;
      case "food/coffee":
      case "food/coffee_dessert":
        return <CoffeeDetail card={localCard} onSaveDetails={saveDetails} />;
      case "food/cocktail_bar":
      case "food/drinks":
        return <CocktailBarDetail card={localCard} onSaveDetails={saveDetails} />;
      case "food/restaurant":
        return <RestaurantDetail card={localCard} onSaveDetails={saveDetails} />;
      case "activity/self_directed":
        return <SelfDirectedDetail card={localCard} onSaveDetails={saveDetails} />;
      case "activity/guided":
      case "activity/hosted":
        return <GuidedDetail card={localCard} onSaveDetails={saveDetails} />;
      case "activity/note":
        return <NoteDetail notes={(localCard.details?.notes as string) ?? ""} onSave={(v) => saveDetails("notes", v)} />;
      case "activity/event":
        return <EventDetail card={localCard} onSaveDetails={saveDetails} />;
      case "activity/challenge":
        return <ChallengeDetail card={localCard} onSaveDetails={saveDetails} />;
      // Legacy fallbacks
      case "logistics/flight_departure":
        return <LogisticsDetail card={localCard} />;
      case "logistics/hotel":
        return <HotelDetail card={localCard} onSaveDetails={saveDetails} />;
      case "activity/wellness":
        return <ActivityDetail card={localCard} />;
      default:
        if (localCard.type === "logistics") return <LogisticsDetail card={localCard} />;
        if (localCard.type === "activity")  return <ActivityDetail  card={localCard} />;
        return <RestaurantDetail card={localCard} onSaveDetails={saveDetails} />;
    }
  }

  // ── Address display ────────────────────────────────────────
  const addressLine = localCard.address ?? (
    localCard.lat != null && localCard.lng != null
      ? `${localCard.lat.toFixed(4)}, ${localCard.lng.toFixed(4)}`
      : null
  );

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet min-h-[50dvh] max-h-[90dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Cover photo hero (shown when a place photo is available) */}
        {localCard.cover_image_url ? (
          <div className="relative w-full h-36 flex-shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={localCard.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Gradient overlay so drag handle is visible */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
            {/* Drag handle on top of photo */}
            <div className="absolute top-2.5 left-0 right-0 flex justify-center cursor-grab">
              <div className="w-9 h-[3px] rounded-full bg-white/60" />
            </div>
          </div>
        ) : (
          <div className="flex justify-center pt-2.5 pb-0 flex-shrink-0 cursor-grab">
            <div className="w-9 h-[3px] rounded-full bg-gray-200" />
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-3 pb-4 flex-shrink-0 border-b border-gray-100">
          {/* Top row: type badge + booking badge + close */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${accent.bg}`}>
                <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                <span className={`text-[11px] font-semibold ${accent.text}`}>{typeLabel}</span>
              </div>
              {badge && (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${badge.classes}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Editable title */}
          <div className="mt-2.5">
            <TitleEditor
              value={localCard.title}
              onSave={(v) => saveTopLevel("title", v)}
            />
          </div>

          {/* Address line + rating */}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {addressLine && (
              <p className="text-xs text-gray-400 leading-snug">{addressLine}</p>
            )}
            {rating !== null && (
              <>
                {addressLine && <span className="text-gray-200 text-xs">·</span>}
                <span className="text-xs font-semibold text-amber-500">★ {rating.toFixed(1)}</span>
              </>
            )}
          </div>

          {/* Open in Google Maps */}
          {localCard.lat != null && localCard.lng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${localCard.lat},${localCard.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Open in Google Maps
            </a>
          )}

          {/* Time range + duration + source link */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {timeRange && (
              <span className="text-sm text-gray-400 font-medium">{timeRange}</span>
            )}
            {duration && (
              <>
                {timeRange && <span className="text-gray-200 text-sm">·</span>}
                <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                  {duration}
                </span>
              </>
            )}
            {localCard.source_url && (
              <>
                {(timeRange || duration) && <span className="text-gray-200 text-sm">·</span>}
                <a
                  href={localCard.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Source"
                >
                  {/* Globe icon */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Source
                </a>
              </>
            )}
          </div>
        </div>

        {/* Scrollable detail content */}
        <div className="relative flex-1 min-h-0 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-8 after:bg-gradient-to-t after:from-white after:to-transparent after:pointer-events-none">
          <div className="overflow-y-auto h-full px-5 py-5 pb-[68px]">
            {renderDetail()}
          </div>
        </div>

        {/* Bottom action area */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white">
          {/* Assign to Day — only for unplaced cards */}
          {localCard.status === "interested" && days && days.length > 0 && !showDeleteConfirm && (
            <div className="px-5 pt-4 pb-2">
              <button
                onClick={() => setShowDayPicker(true)}
                className="w-full py-3 rounded-xl bg-activity text-white text-[14px] font-bold active:scale-[0.98] transition-all"
              >
                Assign to Day
              </button>
            </div>
          )}

          {/* Link place from map — for itinerary cards */}
          {localCard.status === "in_itinerary" && !showDeleteConfirm && (
            <div className="px-5 pt-3 pb-1">
              <button
                onClick={() => setShowLinkSheet(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                Link place from map
              </button>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm ? (
            <div className="px-5 pt-3 pb-5">
              <p className="text-[13px] font-medium text-gray-700 text-center mb-3">
                Delete this card? This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors"
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
              {deleteError && (
                <p className="text-[11px] text-red-500 text-center mt-2">{deleteError}</p>
              )}
            </div>
          ) : (
            /* Delete card link */
            <div className="flex justify-center py-3">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[12px] text-red-400 hover:text-red-600 transition-colors px-4 py-1"
              >
                Delete card
              </button>
            </div>
          )}
        </div>

        {/* Link place sheet */}
        {showLinkSheet && (
          <div className="absolute inset-0 z-10">
            <LinkPlaceSheet
              tripId={localCard.trip_id}
              cardType={localCard.type}
              onLink={handleLinkPlace}
              onClose={() => setShowLinkSheet(false)}
            />
          </div>
        )}

        {/* Day picker overlay */}
        {showDayPicker && days && (
          <div className="absolute inset-0 z-10 bg-white rounded-t-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-[16px] font-bold text-gray-900">Assign to day</h3>
              <button
                onClick={() => setShowDayPicker(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => handleAssignToDay(day)}
                  className="w-full flex items-center gap-3 px-5 py-4 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[12px] font-bold text-activity">{day.day_number}</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-gray-900">
                      Day {day.day_number}{day.day_name ? ` — ${day.day_name}` : ""}
                    </p>
                    {day.date && (
                      <p className="text-[12px] text-gray-400">
                        {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
