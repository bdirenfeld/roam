"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Card, Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import LinkPlaceSheet from "@/components/plan/LinkPlaceSheet";
import AttachmentsPanel from "./AttachmentsPanel";
import { CardGallery } from "@/components/ui/CardGallery";
import { NavigationSheet } from "@/components/ui/NavigationSheet";

// ── Type-specific detail components ───────────────────────────
import FlightArrivalDetail from "./detail/FlightArrivalDetail";
import CoffeeDetail from "./detail/CoffeeDetail";
import CocktailBarDetail from "./detail/CocktailBarDetail";
import RestaurantDetail from "./detail/RestaurantDetail";
import SelfDirectedDetail from "./detail/SelfDirectedDetail";
import GuidedDetail from "./detail/GuidedDetail";
import EventDetail from "./detail/EventDetail";
import ChallengeDetail from "./detail/ChallengeDetail";
import WellnessDetail from "./detail/WellnessDetail";

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
  /** Trip destination string (e.g. "Rome, Italy") — used to derive country dial code */
  tripDestination?: string;
}

// ── Sub-type display labels ────────────────────────────────────
const SUB_TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
  self_directed:    "Self-Directed",
  guided:           "Guided",
  hosted:           "Guided",
  wellness:         "Wellness",
  event:            "Event",
  challenge:        "Challenge",
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  dessert:          "Dessert",
  fine_dining:      "Fine Dining",
  bar:              "Bar",
  cocktail_bar:     "Bar",
  drinks:           "Bar",
  hotel:            "Hotel",
  transit:          "Transit",
  note:             "Note",
};

// ── Category options (top level of two-level picker) ──────────
const CATEGORY_OPTIONS = [
  { value: "food",      label: "Food"      },
  { value: "activity",  label: "Activity"  },
  { value: "logistics", label: "Logistics" },
] as const;

// ── Sub-type options per parent type ──────────────────────────
const SUB_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  activity: [
    { value: "guided",        label: "Guided"        },
    { value: "self_directed", label: "Self-Directed"  },
    { value: "wellness",      label: "Wellness"       },
    { value: "challenge",     label: "Challenge"      },
    { value: "event",         label: "Event"          },
  ],
  food: [
    { value: "restaurant", label: "Restaurant" },
    { value: "coffee",     label: "Coffee"     },
    { value: "dessert",    label: "Dessert"    },
    { value: "bar",        label: "Bar"        },
  ],
  logistics: [
    { value: "hotel",            label: "Hotel"           },
    { value: "flight_arrival",   label: "Flight Arrival"  },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "transit",          label: "Transit"         },
  ],
};

// ── Type accent colours ────────────────────────────────────────
const TYPE_ACCENT: Record<string, { dot: string; bg: string; text: string }> = {
  logistics: { dot: "bg-gray-400", bg: "bg-slate-50",  text: "text-logistics" },
  activity:  { dot: "bg-gray-400", bg: "bg-teal-50",   text: "text-activity"  },
  food:      { dot: "bg-gray-400", bg: "bg-amber-50",  text: "text-food"      },
};

// ── Sub-type picker — self-contained so activeCategory initialises correctly ──
function SubTypePicker({
  currentType,
  currentSubType,
  onSelect,
  onClose,
}: {
  currentType: string;
  currentSubType: string | null;
  onSelect: (type: string, subType: string) => void;
  onClose: () => void;
}) {
  const initial = (["food", "activity", "logistics"] as const).includes(
    currentType as "food" | "activity" | "logistics"
  )
    ? (currentType as "food" | "activity" | "logistics")
    : "food";
  const [activeCategory, setActiveCategory] = useState<"food" | "activity" | "logistics">(initial);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className="absolute left-0 top-8 z-20 bg-white rounded-xl shadow-sheet border border-gray-100 overflow-hidden"
        style={{ minWidth: 220 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Section 1 — Category tabs */}
        <div className="flex border-b border-gray-100">
          {CATEGORY_OPTIONS.map(({ value, label }) => {
            const isActive = activeCategory === value;
            const dotCls = "bg-gray-400";
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveCategory(value)}
                className={`relative flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
                {label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gray-800 rounded-t" />
                )}
              </button>
            );
          })}
        </div>
        {/* Section 2 — Sub-types for the selected category */}
        <div className="py-1">
          {(SUB_TYPE_OPTIONS[activeCategory] ?? []).map(({ value, label }) => {
            const isCurrent = currentSubType === value && currentType === activeCategory;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect(activeCategory, value)}
                className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50 ${
                  isCurrent ? "font-bold text-gray-900" : "text-gray-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

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

// ── Country dial code helpers ──────────────────────────────────
const COUNTRY_DIAL: Record<string, string> = {
  "italy":           "+39",
  "france":          "+33",
  "spain":           "+34",
  "germany":         "+49",
  "united kingdom":  "+44",
  "uk":              "+44",
  "japan":           "+81",
  "united states":   "+1",
  "usa":             "+1",
  "canada":          "+1",
  "australia":       "+61",
  "portugal":        "+351",
  "greece":          "+30",
  "netherlands":     "+31",
  "switzerland":     "+41",
  "austria":         "+43",
  "belgium":         "+32",
  "mexico":          "+52",
  "brazil":          "+55",
  "thailand":        "+66",
  "indonesia":       "+62",
  "vietnam":         "+84",
  "india":           "+91",
  "morocco":         "+212",
  "turkey":          "+90",
  "egypt":           "+20",
  "south africa":    "+27",
};

/** Derive dial code from an address string or destination (checks last comma segment first). */
function dialCodeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Try last comma-segment first (e.g. "Via Roma 1, 00100 Roma, Italy" → "italy")
  const parts = lower.split(",").map((p) => p.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    for (const [country, code] of Object.entries(COUNTRY_DIAL)) {
      if (seg === country || seg.endsWith(` ${country}`) || seg.startsWith(`${country} `)) {
        return code;
      }
    }
  }
  // Full-text match as fallback
  for (const [country, code] of Object.entries(COUNTRY_DIAL)) {
    if (lower.includes(country)) return code;
  }
  return null;
}

/**
 * Build a normalized tel: href and display string.
 * - Already has country code (+...): use as-is.
 * - Italy (+39): strip leading 0 from local number, then prepend +39.
 * - Others: prepend the dial code directly.
 */
function formatPhone(
  raw: string,
  cardAddress: string | null | undefined,
  tripDestination: string | undefined,
): { href: string; display: string } {
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+")) {
    return { href: `tel:${stripped}`, display: raw };
  }
  const dialCode = dialCodeFromText(cardAddress) ?? dialCodeFromText(tripDestination);
  if (!dialCode) {
    return { href: `tel:${stripped}`, display: raw };
  }
  // Italy rule: local numbers typically start with 0 (area code); strip it.
  const localNum = dialCode === "+39" && stripped.startsWith("0")
    ? stripped.slice(1)
    : stripped;
  const international = `${dialCode}${localNum}`;
  // Display: show dial code visibly, keep original spacing for readability
  const displayNum = dialCode === "+39" && raw.trimStart().startsWith("0")
    ? raw.trimStart().slice(1)
    : raw;
  return { href: `tel:${international}`, display: `${dialCode} ${displayNum.trim()}` };
}

// ── Time picker helpers ───────────────────────────────────────
/** Convert "HH:MM" or "HH:MM:SS" to the value needed by <input type="time"> ("HH:MM") */
function toInputTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5); // "HH:MM"
}

/** Convert <input type="time"> value ("HH:MM") to DB storage format ("HH:MM:SS") */
function toDbTime(v: string): string {
  return v ? `${v}:00` : "";
}

/**
 * Inline editable time chip.
 * Displays as a tappable pill. On click, activates a native time picker.
 */
function TimeChip({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (hhmm: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputVal = toInputTime(value);

  const displayVal = value ? formatTime(value) : null;

  const handleClick = () => {
    // showPicker() is not available in all environments; fall back to focus + click
    if (inputRef.current) {
      inputRef.current.focus();
      try { inputRef.current.showPicker?.(); } catch { /* ignore */ }
    }
  };

  return (
    <span className="relative inline-flex items-center">
      {/* Visible pill */}
      <button
        type="button"
        onClick={handleClick}
        className={`text-sm px-2 py-0.5 rounded-md transition-colors hover:bg-gray-100 active:bg-gray-200 ${displayVal ? "text-gray-700 font-medium" : "text-gray-400 italic"}`}
      >
        {displayVal ?? placeholder}
      </button>
      {/* Hidden native time input — overlaid for picker activation */}
      <input
        ref={inputRef}
        type="time"
        value={inputVal}
        onChange={(e) => { if (e.target.value) onSave(e.target.value); }}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: 0 }}
      />
    </span>
  );
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
export default function CardBottomSheet({ card, onClose, onCardUpdate, onCardDelete, days, tripDestination }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const isDragging = useRef(false);

  // Local optimistic state
  const [localCard, setLocalCard] = useState<Card>(card);
  const [showDayPicker,     setShowDayPicker]     = useState(false);
  const [showMovePicker,    setShowMovePicker]    = useState(false);
  const [showLinkSheet,     setShowLinkSheet]     = useState(false);
  const [showAttachments,   setShowAttachments]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmptyFields,   setShowEmptyFields]   = useState(false);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  const [linkMergeMessage,  setLinkMergeMessage]  = useState<string | null>(null);
  const [navSheetOpen,      setNavSheetOpen]      = useState(false);

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

  // ── Link place from map — inherit pin data, preserve user fields ─
  const handleLinkPlace = useCallback(async (place: Card) => {
    setShowLinkSheet(false);
    const placeDetails  = (place.details  ?? {}) as Record<string, unknown>;
    const currentDetails = (localCard.details ?? {}) as Record<string, unknown>;

    // Build merged details: start from current card (preserves notes, flow, prep, tips, etc.)
    // then overwrite with the pin's place-specific fields
    const mergedDetails: Record<string, unknown> = {
      ...currentDetails,
      ...(placeDetails.place_id      != null ? { place_id:      placeDetails.place_id      } : {}),
      ...(placeDetails.rating        != null ? { rating:        placeDetails.rating        } : {}),
      ...(placeDetails.phone         != null ? { phone:         placeDetails.phone         } : {}),
      ...(placeDetails.website       != null ? { website:       placeDetails.website       } : {}),
      ...(placeDetails.currency_code != null ? { currency_code: placeDetails.currency_code } : {}),
    };

    // Always overwrite location, photo, and category from pin; never touch scheduling
    const topUpdate: Partial<Card> = {};
    if (place.lat             != null) topUpdate.lat             = place.lat;
    if (place.lng             != null) topUpdate.lng             = place.lng;
    if (place.address         != null && place.address         !== "") topUpdate.address         = place.address;
    if (place.cover_image_url != null && place.cover_image_url !== "") topUpdate.cover_image_url = place.cover_image_url;
    if (place.type            != null) topUpdate.type            = place.type;
    if (place.sub_type        != null) topUpdate.sub_type        = place.sub_type;

    const placeName = (place.title ?? "").trim();
    if (placeName) topUpdate.title = placeName;

    const updated: Card = {
      ...localCard,
      ...topUpdate,
      details: mergedDetails as typeof localCard.details,
    };

    setLocalCard(updated);
    onCardUpdate?.(updated);
    setLinkMergeMessage("Linked!");
    setTimeout(() => setLinkMergeMessage(null), 3000);

    await supabase.from("cards").update({
      ...topUpdate,
      details: mergedDetails,
    }).eq("id", localCard.id);
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

  // ── Move to different day (in_itinerary) ─────────────────────
  const handleMoveToDay = useCallback(
    async (day: Day) => {
      setShowMovePicker(false);
      if (day.id === localCard.day_id) return;
      const prev = localCard;
      const updated = { ...localCard, day_id: day.id };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await supabase
        .from("cards")
        .update({ day_id: day.id })
        .eq("id", localCard.id);

      if (error) {
        console.error("Failed to move to day", error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase],
  );

  // ── Type + sub-type change ─────────────────────────────────
  const handleTypeAndSubTypeChange = useCallback(
    async (newType: string, newSubType: string) => {
      setShowSubTypePicker(false);
      const prev = localCard;
      const updated = { ...localCard, type: newType as Card["type"], sub_type: newSubType };
      setLocalCard(updated);
      onCardUpdate?.(updated);
      const { error } = await supabase
        .from("cards")
        .update({ type: newType, sub_type: newSubType })
        .eq("id", localCard.id);
      if (error) {
        console.error("Failed to save type/sub_type", error.message);
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
  const typeLabel =
    (localCard.sub_type ? SUB_TYPE_LABEL[localCard.sub_type] : undefined) ??
    SUB_TYPE_OPTIONS[localCard.type]?.[0]?.label ??
    localCard.type;
  const rating  = typeof (localCard.details as Record<string, unknown>)?.rating === "number"
                    ? ((localCard.details as Record<string, unknown>).rating as number)
                    : null;
  const rawPhone = typeof (localCard.details as Record<string, unknown>)?.phone === "string"
                    ? ((localCard.details as Record<string, unknown>).phone as string)
                    : null;
  const phone    = rawPhone
    ? formatPhone(rawPhone, localCard.address, tripDestination)
    : null;
  const website = typeof (localCard.details as Record<string, unknown>)?.website === "string"
                    ? ((localCard.details as Record<string, unknown>).website as string)
                    : null;

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
        return <CoffeeDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "food/bar":
      case "food/cocktail_bar":
        return <CocktailBarDetail card={localCard} onSaveDetails={saveDetails} hideAddress showEmpty={showEmptyFields} />;
      case "food/drinks":
        return <CocktailBarDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "food/restaurant":
        return <RestaurantDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "activity/self_directed":
        return <SelfDirectedDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "activity/guided":
      case "activity/hosted":
        return <GuidedDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "activity/note":
        return <NoteDetail notes={(localCard.details?.notes as string) ?? ""} onSave={(v) => saveDetails("notes", v)} />;
      case "activity/event":
        return <EventDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "activity/challenge":
        return <ChallengeDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "logistics/flight_departure":
        return <FlightArrivalDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "logistics/hotel":
        return <HotelDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      case "activity/wellness":
        return <WellnessDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
      default:
        if (localCard.type === "logistics") return <LogisticsDetail card={localCard} />;
        if (localCard.type === "activity")  return <ActivityDetail  card={localCard} />;
        return <RestaurantDetail card={localCard} onSaveDetails={saveDetails} showEmpty={showEmptyFields} />;
    }
  }

  // ── Address display ────────────────────────────────────────
  const addressLine = localCard.address ?? (
    localCard.lat != null && localCard.lng != null
      ? `${localCard.lat.toFixed(4)}, ${localCard.lng.toFixed(4)}`
      : null
  );

  return (
    <>
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet h-[95dvh] max-h-[95dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 ease-spring"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle + header — touch-to-dismiss only from this area */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-shrink-0"
        >
        {/* Cover photo hero — swipeable gallery */}
        <div className="relative w-full overflow-hidden">
          <CardGallery
            placeId={(localCard.details as Record<string, unknown>)?.place_id as string | undefined}
            coverImageUrl={localCard.cover_image_url}
            fallbackLat={localCard.lat}
            fallbackLng={localCard.lng}
            cardTitle={localCard.title}
            height={220}
          />
          {/* Gradient overlay so drag handle is visible */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" style={{ zIndex: 20 }} />
          {/* Drag handle on top of photo */}
          <div className="absolute top-2.5 left-0 right-0 flex justify-center cursor-grab" style={{ zIndex: 21 }}>
            <div className="w-9 h-[3px] rounded-full bg-white/60" />
          </div>
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          {/* Top row: type badge + booking badge + [📍 Link] [🗑 Delete] [✕ Close] */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              {/* Type badge — tappable to change sub-type */}
              <div className="relative">
                <button
                  onClick={() => !isNote && setShowSubTypePicker((v) => !v)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${accent.bg} ${!isNote ? "hover:opacity-80 active:opacity-70 transition-opacity cursor-pointer" : "cursor-default"}`}
                >
                  <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                  <span className={`text-[11px] font-semibold ${accent.text}`}>{typeLabel}</span>
                  {!isNote && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={accent.text}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </button>
                {showSubTypePicker && !isNote && (
                  <SubTypePicker
                    currentType={localCard.type}
                    currentSubType={localCard.sub_type ?? null}
                    onSelect={handleTypeAndSubTypeChange}
                    onClose={() => setShowSubTypePicker(false)}
                  />
                )}
              </div>
              {badge && (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${badge.classes}`}>
                  {badge.label}
                </span>
              )}
              {linkMergeMessage && (
                <span className="text-[11px] font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                  {linkMergeMessage}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Paperclip — attachments (logistics and activity cards only) */}
              {(localCard.type === "logistics" || localCard.type === "activity") && (
                <button
                  onClick={() => setShowAttachments(true)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  aria-label="Attachments"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              )}
              {localCard.status === "in_itinerary" && (
                <button
                  onClick={() => setShowLinkSheet(true)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  aria-label="Link place from map"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                aria-label="Delete card"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Editable title */}
          <div className="mt-2.5">
            <TitleEditor
              value={localCard.title}
              onSave={(v) => saveTopLevel("title", v)}
            />
          </div>

          {/* Editable time row */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {/* Start time — always shown */}
            <TimeChip
              value={localCard.start_time}
              placeholder="Add start time"
              onSave={(hhmm) => saveTopLevel("start_time", toDbTime(hhmm))}
            />

            {/* Separator + end time (or "+" to add end time) */}
            {localCard.start_time && (
              localCard.end_time ? (
                <>
                  <span className="text-gray-300 text-sm select-none">–</span>
                  <TimeChip
                    value={localCard.end_time}
                    placeholder="End time"
                    onSave={(hhmm) => saveTopLevel("end_time", toDbTime(hhmm))}
                  />
                </>
              ) : (
                <TimeChip
                  value={null}
                  placeholder="+ end time"
                  onSave={(hhmm) => saveTopLevel("end_time", toDbTime(hhmm))}
                />
              )
            )}

            {/* Duration */}
            {duration && (
              <>
                <span className="text-gray-300 text-sm select-none">·</span>
                <span className="text-sm text-gray-400">{duration}</span>
              </>
            )}

            {/* Overnight warning */}
            {localCard.start_time && localCard.end_time &&
              toInputTime(localCard.end_time) < toInputTime(localCard.start_time) && (
              <span className="text-[11px] text-amber-500 font-medium ml-0.5">overnight</span>
            )}

            {/* Source link */}
            {localCard.source_url && (
              <>
                <span className="text-gray-300 text-sm">·</span>
                <a
                  href={localCard.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Source"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Source
                </a>
              </>
            )}
          </div>

          {/* Address line */}
          {addressLine && (
            <p className="text-xs text-gray-400 leading-snug mt-1">{addressLine}</p>
          )}

          {/* Action row: [★ rating ·] [📍 Maps] [🌐] [📞 Call] */}
          {(rating !== null || localCard.lat != null || localCard.lng != null || (localCard.details as Record<string, unknown>)?.place_id != null || website || phone) && (
            <div className="flex items-center gap-2 mt-2">
              {rating !== null && localCard.sub_type !== "flight_arrival" && localCard.sub_type !== "flight_departure" && (
                <>
                  <span className="text-xs font-semibold text-amber-500">★ {rating.toFixed(1)}</span>
                  <span className="text-gray-200 text-xs">·</span>
                </>
              )}
              {(localCard.lat != null && localCard.lng != null || (localCard.details as Record<string, unknown>)?.place_id != null) && (
                <button
                  onClick={() => setNavSheetOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  Maps
                </button>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </a>
              )}
              {phone && (
                <a
                  href={phone.href}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Call
                </a>
              )}
            </div>
          )}
        </div>
        </div>{/* end drag/header touch zone */}

        {/* Scrollable detail content */}
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 overflow-y-auto px-5 py-5">
            {renderDetail()}

            {/* Confirmation toggle — guided activities, all logistics, restaurants */}
            {((localCard.type === "activity" && localCard.sub_type === "guided") ||
              localCard.type === "logistics" ||
              (localCard.type === "food" && localCard.sub_type === "restaurant")) && (
              <button
                onClick={() => saveTopLevel("confirmed", !localCard.confirmed)}
                className="w-full flex items-center justify-between mt-5 pt-4 border-t border-gray-100"
              >
                <span className="text-[13px] font-medium text-gray-700">Confirmed</span>
                <div style={{
                  width: 40, height: 22, borderRadius: 11,
                  backgroundColor: localCard.confirmed ? "#1A1A2E" : "#E5E7EB",
                  transition: "background-color 200ms",
                  position: "relative", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 2,
                    left: localCard.confirmed ? 20 : 2,
                    width: 18, height: 18, borderRadius: "50%",
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 200ms",
                  }} />
                </div>
              </button>
            )}

            {/* Add details / collapse toggle — not shown for notes */}
            {localCard.sub_type !== "note" && (
              <button
                onClick={() => setShowEmptyFields((v) => !v)}
                className="mt-4 flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold leading-none">
                  {showEmptyFields ? "−" : "+"}
                </span>
                {showEmptyFields ? "Hide empty fields" : "Add details"}
              </button>
            )}
          </div>
          {/* Gradient fade to hint at more content below */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
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

          {/* Move to Day — for in_itinerary cards (useful on mobile) */}
          {localCard.status === "in_itinerary" && days && days.length > 1 && !showDeleteConfirm && (
            <div className="px-5 pt-3 pb-2">
              <button
                onClick={() => setShowMovePicker(true)}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[13px] font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all"
              >
                Move to Day
              </button>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
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
          )}
        </div>

        {/* Attachments panel */}
        {showAttachments && (
          <AttachmentsPanel
            card={localCard}
            onClose={() => setShowAttachments(false)}
            onCardUpdate={(updated) => { setLocalCard(updated); onCardUpdate?.(updated); }}
          />
        )}

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

        {/* Move to day picker overlay */}
        {showMovePicker && days && (
          <div className="absolute inset-0 z-10 bg-white rounded-t-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-[16px] font-bold text-gray-900">Move to day</h3>
              <button
                onClick={() => setShowMovePicker(false)}
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
              {days.map((day) => {
                const isCurrent = day.id === localCard.day_id;
                return (
                  <button
                    key={day.id}
                    onClick={() => handleMoveToDay(day)}
                    disabled={isCurrent}
                    className={`w-full flex items-center gap-3 px-5 py-4 border-b border-gray-50 transition-colors text-left ${isCurrent ? "opacity-40 cursor-default" : "hover:bg-gray-50 active:bg-gray-100"}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-[12px] font-bold text-activity">{day.day_number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900">
                        Day {day.day_number}{day.day_name ? ` — ${day.day_name}` : ""}
                        {isCurrent && <span className="ml-2 text-[11px] text-gray-400 font-normal">current</span>}
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
                );
              })}
            </div>
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

    <NavigationSheet
      isOpen={navSheetOpen}
      onClose={() => setNavSheetOpen(false)}
      placeName={localCard.title}
      placeId={(localCard.details as Record<string, unknown>)?.place_id as string | undefined}
      lat={localCard.lat}
      lng={localCard.lng}
    />
    </>
  );
}
