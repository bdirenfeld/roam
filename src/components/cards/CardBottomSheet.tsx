"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Clock, Heart } from "@phosphor-icons/react";
import type { Card, ChecklistItem, Day, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import { applyOverlay } from "@/lib/offline/writeQueue";
import { formatTimeValue } from "@/lib/formatTime";
import { scheduleCardOnDay } from "@/lib/scheduleCard";
import LovedHeart from "@/components/ui/LovedHeart";
import { readRecommendedBy } from "@/lib/recommendedBy";
import FieldRow, { SectionLabel } from "./detail/FieldRow";
import LinkPlaceSheet from "@/components/plan/LinkPlaceSheet";
import AttachmentsPanel from "./AttachmentsPanel";
import CardChecklist from "./CardChecklist";
import { readChecklist } from "./cardChecklistModel";
import DayPickerOverlay from "./DayPickerOverlay";
import PlacePhotoGallery from "./PlacePhotoGallery";
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

/** Read Google's `weekday_text` (seven "Monday: 9:00 AM – 5:00 PM" lines) off
 *  the raw place hours. The bottom sheet is the deliberate lookup surface, so it
 *  always shows the full week when it exists. Returns null when absent/malformed. */
function readWeekdayText(hours: unknown): string[] | null {
  if (typeof hours !== "object" || hours === null) return null;
  const wt = (hours as { weekday_text?: unknown }).weekday_text;
  if (!Array.isArray(wt)) return null;
  const lines = wt.filter((l): l is string => typeof l === "string");
  return lines.length > 0 ? lines : null;
}

interface Props {
  card: Card;
  onClose: () => void;
  /** Called after every successful (or optimistically applied) edit. */
  onCardUpdate?: (card: Card) => void;
  /** Called after the card is permanently deleted. */
  onCardDelete?: (cardId: string) => void;
  /** Called with the NEW card written by "Copy to another day". The card this
   *  sheet is showing is unchanged — the caller splices the new one into the
   *  target day so the board/agenda updates without a refetch. */
  onCardCopied?: (card: Card) => void;
  /** Days available for assignment (shows "Assign to Day" when card is interested) */
  days?: Day[];
  /** Trip destination string (e.g. "Rome, Italy") — used to derive country dial code */
  tripDestination?: string;
  /** Guest view — render every section read-only; no edit/add/delete/move
   *  controls, no editable fields, and the confirmation reference is hidden. */
  readOnly?: boolean;
}

/** Drop the booking/flight confirmation reference so it never renders for a
 *  guest. Other facts (meeting point, includes, contact, transport) are kept. */
function withoutConfirmation(details: Card["details"]): Card["details"] {
  const rest = { ...details };
  delete (rest as Record<string, unknown>).confirmation;
  return rest;
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
  beach:            "Beach",
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
  grocery:          "Grocery",
  medical:          "Medical",
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
    { value: "event",         label: "Event"          },
    { value: "beach",         label: "Beach"          },
  ],
  food: [
    { value: "restaurant", label: "Restaurant" },
    { value: "coffee",     label: "Coffee"     },
    { value: "dessert",    label: "Dessert"    },
    { value: "bar",        label: "Bar"        },
  ],
  logistics: [
    { value: "hotel",            label: "Hotel"            },
    { value: "flight_arrival",   label: "Flight Arrival"   },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "transit",          label: "Transit"          },
    { value: "grocery",          label: "Grocery"          },
    { value: "medical",          label: "Medical"          },
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
 * Inline editable time field.
 * The visible face is an editorial label when unset ("Add start time") or the
 * shared-formatter time when set ("9:00 AM") — never the browser's native
 * "--:-- --" empty state. A real <input type="time"> sits collapsed underneath
 * as the click target, so clicking the chip reliably opens the native picker.
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
  const display  = value ? formatTimeValue(value) : null;

  // Clicking anywhere on the chip opens the native picker. showPicker() isn't
  // available everywhere — focus first so a bare focus still surfaces it on mobile.
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* ignore */ }
  };

  return (
    <span
      onClick={openPicker}
      className="relative inline-flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-black/[0.02]"
      style={{
        background: "#FAF7F2",
        boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)",
      }}
    >
      <Clock size={13} weight="light" color="#1A1A2E" />
      {/* Visible face — formatted time, or the editorial prompt when unset.
          The native "--:-- --" never shows; the input below is collapsed. */}
      {display ? (
        <span
          className="text-[13px] font-medium text-[#1A1A2E]"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          {display}
        </span>
      ) : (
        <span
          className="text-[13px] italic"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "rgba(26,26,46,0.45)" }}
        >
          {placeholder}
        </span>
      )}
      {/* Real picker target — focusable but visually collapsed (w-px, opacity-0,
          not display:none so showPicker() still works). */}
      <input
        ref={inputRef}
        type="time"
        value={inputVal}
        aria-label={placeholder}
        tabIndex={-1}
        onChange={(e) => { if (e.target.value) onSave(e.target.value); }}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 p-0 border-0 pointer-events-none"
        style={{ colorScheme: "light" }}
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
export default function CardBottomSheet({ card, onClose, onCardUpdate, onCardDelete, onCardCopied, days, tripDestination, readOnly = false }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragX = useRef(0);
  const dragY = useRef(0);
  const isDragging = useRef(false);
  // Axis lock for the photo hero: a touch starts "pending" and only commits to
  // a vertical sheet drag once the gesture has moved far enough to reveal its
  // intent. A horizontally-dominant swipe releases the sheet entirely so the
  // gallery's native scroll-snap owns it — otherwise a diagonal photo swipe
  // drags the sheet down and >120px of drift dismisses it mid-swipe.
  const dragAxis = useRef<"pending" | "vertical" | "horizontal">("pending");
  const AXIS_LOCK_THRESHOLD = 8;

  // Local optimistic state
  // Queued-but-unsent edits are laid over the incoming row on open. The Day
  // view already does this for its list, but the sheet is also opened from the
  // Plan board, whose cards come straight from the cached page payload.
  const [localCard, setLocalCard] = useState<Card>(() => applyOverlay("cards", card));
  const [showDayPicker,     setShowDayPicker]     = useState(false);
  const [showMovePicker,    setShowMovePicker]    = useState(false);
  const [showCopyPicker,    setShowCopyPicker]    = useState(false);
  // Move and Copy used to own a permanent 110px shelf at the bottom of the
  // sheet — a quarter of a phone screen, held for two actions used
  // occasionally, while the notes you opened the card to read got a third.
  const [showCardMenu,      setShowCardMenu]      = useState(false);

  // The hero sizes itself to the screen it is on. 150 is right on a normal
  // phone and greedy on a short one — an SE, or any phone with the keyboard
  // up — where the same 150px is a much larger share of what is left.
  const [photoHeight, setPhotoHeight] = useState(150);
  useEffect(() => {
    const measure = () => setPhotoHeight(window.innerHeight < 700 ? 110 : 150);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const [isCopying,         setIsCopying]         = useState(false);
  const [copyNotice,        setCopyNotice]        = useState<{ text: string; ok: boolean } | null>(null);
  const [showLinkSheet,     setShowLinkSheet]     = useState(false);
  const [showAttachments,   setShowAttachments]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmptyFields,   setShowEmptyFields]   = useState(false);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  const [linkMergeMessage,  setLinkMergeMessage]  = useState<string | null>(null);
  const [navSheetOpen,      setNavSheetOpen]      = useState(false);
  const [showMenuInput,     setShowMenuInput]     = useState(false);
  const [menuInputValue,    setMenuInputValue]    = useState("");

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
    dragX.current = e.touches[0].clientX;
    dragY.current = e.touches[0].clientY;
    // Nothing is committed yet — the first significant move picks the axis.
    dragAxis.current = "pending";
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!sheetRef.current) return;
    const dx = e.touches[0].clientX - dragX.current;
    const dy = e.touches[0].clientY - dragY.current;

    if (dragAxis.current === "pending") {
      // Wait for enough travel to read intent, then lock for the whole gesture.
      if (Math.abs(dx) < AXIS_LOCK_THRESHOLD && Math.abs(dy) < AXIS_LOCK_THRESHOLD) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        dragAxis.current = "horizontal"; // hand the gesture to the gallery
        return;
      }
      dragAxis.current = "vertical";
      isDragging.current = true;
    }

    if (dragAxis.current !== "vertical" || !isDragging.current) return;
    sheetRef.current.style.transform = `translateY(${Math.max(0, dy)}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const axis = dragAxis.current;
      dragAxis.current = "pending"; // re-evaluated on the next touchstart
      if (axis !== "vertical" || !isDragging.current || !sheetRef.current) return;
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
  // OFFLINE — time edits and every other single-column save go through the
  // write queue. When the write can't reach Supabase it is stored and replayed
  // on reconnect, and the optimistic value stands instead of being rolled
  // back. Only a real refusal (RLS, a deleted row) reverts, exactly as before.
  const saveTopLevel = useCallback(
    async (field: string, value: unknown) => {
      const prev = localCard;
      const updated = { ...localCard, [field]: value };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await queuedUpdate("cards", { id: localCard.id }, { [field]: value });

      if (error) {
        console.error("Failed to save", field, error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate]
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

      // Covers the checklist too — CardChecklist hands the WHOLE array back
      // through this same door, so a tick made offline is queued as one
      // `details` patch and replays intact.
      const { error } = await queuedUpdate("cards", { id: localCard.id }, { details: newDetails });

      if (error) {
        console.error("Failed to save details.", field, error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, saveTopLevel]
  );

  const saveMenuUrl = useCallback(async () => {
    const url = menuInputValue.trim();
    if (!url) return;
    await saveDetails("menu_url", url);
    setShowMenuInput(false);
    setMenuInputValue("");
  }, [menuInputValue, saveDetails]);

  // ── "We loved this" ──────────────────────────────────────────
  // Lives on the PLACE, not the card: you loved the restaurant, not the
  // Tuesday you ate at it, so every card pointing at it inherits the mark.
  // Optimistic, and the whole card reverts if the write is refused.
  const toggleLoved = useCallback(async () => {
    const p = localCard.place;
    if (!p || !localCard.place_id) return;

    const prev    = localCard;
    const next    = !p.loved;
    const lovedAt = next ? new Date().toISOString() : null;
    const updated: Card = {
      ...localCard,
      place: { ...p, loved: next, loved_at: lovedAt },
    };
    setLocalCard(updated);
    onCardUpdate?.(updated);

    const { error } = await supabase
      .from("places")
      .update({ loved: next, loved_at: lovedAt })
      .eq("id", localCard.place_id);

    if (error) {
      console.error("Failed to save loved on places", error.message);
      setLocalCard(prev);
      onCardUpdate?.(prev);
    }
  }, [localCard, onCardUpdate, supabase]);

  // ── Recommended by ───────────────────────────────────────────
  // The map's add flow writes this at save time; this makes it editable after
  // the fact. Clearing it DELETES the key rather than writing null, matching
  // MapPinPopup — the pin styling reads `!!details.recommended_by`.
  const saveRecommendedBy = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      const prev = localCard;
      const newDetails = { ...localCard.details } as Record<string, unknown>;
      if (trimmed) newDetails.recommended_by = trimmed;
      else delete newDetails.recommended_by;

      const updated = { ...localCard, details: newDetails as Card["details"] };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      const { error } = await supabase
        .from("cards")
        .update({ details: newDetails })
        .eq("id", localCard.id);

      if (error) {
        console.error("Failed to save recommended_by", error.message);
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase],
  );

  // ── Checklist ────────────────────────────────────────────────
  // The panel hands back the WHOLE array every time — order is meaning here,
  // so there is no per-item write to get out of sequence. Goes through the
  // ordinary details save, which is optimistic and reverts the card if the
  // write is refused; the panel re-seeds itself from that revert.
  const saveChecklist = useCallback(
    (items: ChecklistItem[]) => { void saveDetails("checklist", items); },
    [saveDetails],
  );

  // ── Link place from map — repoint the card to the selected place ─
  // Clean relink: set place_id to the selected pin's place. If the card
  // already pointed at a different place, this replaces it. Nothing else
  // (day_id, status, position, details) is touched.
  const handleLinkPlace = useCallback(async (place: Card) => {
    setShowLinkSheet(false);

    const updated: Card = {
      ...localCard,
      place_id: place.place_id,
      place:    place.place,
    };

    setLocalCard(updated);
    onCardUpdate?.(updated);
    setLinkMergeMessage("Linked!");
    setTimeout(() => setLinkMergeMessage(null), 3000);

    await supabase.from("cards").update({
      place_id: place.place_id,
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

  // ── Copy to another day (in_itinerary) ───────────────────────
  // Writes a brand-new card on the target day through the shared insert helper
  // — same place, same details, same times, unconfirmed. THIS card is never
  // touched, so the sheet keeps showing the original.
  const handleCopyToDay = useCallback(
    async (day: Day) => {
      setShowCopyPicker(false);
      if (day.id === localCard.day_id || isCopying) return;
      setIsCopying(true);

      const created = await scheduleCardOnDay(supabase, {
        tripId:    localCard.trip_id,
        dayId:     day.id,
        placeId:   localCard.place_id,
        place:     localCard.place ?? null,
        details:   localCard.details,
        startTime: localCard.start_time,
        endTime:   localCard.end_time,
        sourceUrl: localCard.source_url,
      });

      setIsCopying(false);
      if (!created) {
        setCopyNotice({ text: "Couldn't copy — please try again.", ok: false });
        setTimeout(() => setCopyNotice(null), 3000);
        return;
      }

      onCardCopied?.(created);
      setCopyNotice({ text: `Copied to Day ${day.day_number}`, ok: true });
      setTimeout(() => setCopyNotice(null), 3000);
    },
    [localCard, isCopying, onCardCopied, supabase],
  );

  // ── Type + sub-type change ─────────────────────────────────
  const handleTypeAndSubTypeChange = useCallback(
    async (newType: string, newSubType: string) => {
      setShowSubTypePicker(false);
      const prev = localCard;
      const updated: Card = {
        ...localCard,
        place: localCard.place
          ? { ...localCard.place, type: newType as Place["type"], sub_type: newSubType }
          : localCard.place,
      };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      if (localCard.place_id) {
        const { error: placeErr } = await supabase
          .from("places")
          .update({ type: newType, sub_type: newSubType })
          .eq("id", localCard.place_id);
        if (placeErr) {
          console.error("Failed to save type/sub_type on places", placeErr.message);
          setLocalCard(prev);
          onCardUpdate?.(prev);
        }
      }
    },
    [localCard, onCardUpdate, supabase],
  );

  const saveTitle = useCallback(
    async (value: string) => {
      const prev = localCard;
      const updated: Card = {
        ...localCard,
        place: localCard.place ? { ...localCard.place, title: value } : localCard.place,
      };
      setLocalCard(updated);
      onCardUpdate?.(updated);

      if (localCard.place_id) {
        const { error: placeErr } = await supabase
          .from("places")
          .update({ title: value })
          .eq("id", localCard.place_id);
        if (placeErr) {
          console.error("Failed to save title on places", placeErr.message);
          setLocalCard(prev);
          onCardUpdate?.(prev);
        }
      }
    },
    [localCard, onCardUpdate, supabase],
  );

  // ── Derived display values ─────────────────────────────────
  const place     = localCard.place ?? null;
  const isNote    = place == null;
  const det       = localCard.details as Record<string, unknown>;
  const noteSnippet = isNote ? (det?.notes as string | undefined) : undefined;
  const displayTitle = place?.title ?? (det?.title as string | undefined) ?? noteSnippet?.slice(0, 60) ?? "(untitled note)";
  // Unlinked cards default to a muted note accent
  const accent    = isNote
    ? { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" }
    : (TYPE_ACCENT[place.type] ?? TYPE_ACCENT.logistics);
  const typeLabel = isNote
    ? "Note"
    : ((place.sub_type ? SUB_TYPE_LABEL[place.sub_type] : undefined) ??
       SUB_TYPE_OPTIONS[place.type]?.[0]?.label ??
       place.type);
  const rating  = place?.rating ?? null;
  // Prefer the embedded place (world facts); fall back to card.details for
  // cards saved before the place row carried these fields (transitional).
  const rawPhone = place?.phone ?? (typeof det?.phone === "string" ? (det.phone as string) : null);
  const phone    = rawPhone
    ? formatPhone(rawPhone, place?.address ?? null, tripDestination)
    : null;
  const website = place?.website ?? (typeof det?.website === "string" ? (det.website as string) : null);
  const weekdayText = readWeekdayText(place?.hours);
  const menuUrl = typeof det?.menu_url === "string"
                    ? ((det.menu_url as string) || null)
                    : null;

  const priceLevel = place?.price_level ?? null;

  const badgePriceLabel = place?.type === "food" && priceLevel != null
    ? (["Free", "€", "€€", "€€€", "€€€€"] as const)[priceLevel] ?? null
    : null;

  const duration = durationLabel(localCard.start_time, localCard.end_time);
  const badge = bookingBadge(localCard.details);

  // A note has no place to love and nobody recommended it — both signals are
  // place-linked cards only. A guest sees the heart only once it is set.
  const canLove       = !!place && !!localCard.place_id;
  const isLoved       = place?.loved === true;
  const showLoved     = canLove && (!readOnly || isLoved);
  const recommendedBy = readRecommendedBy(localCard.details);

  // ── Route to sub-type component ───────────────────────────
  const key = place ? `${place.type}/${place.sub_type ?? ""}` : "note";

  function renderDetail() {
    // Read-only (guest): every detail component already renders static when
    // onSaveDetails is absent, so pass undefined. Strip the confirmation
    // reference and never reveal empty fields (there's nothing to fill in).
    const dCard = readOnly
      ? { ...localCard, details: withoutConfirmation(localCard.details) }
      : localCard;
    const onSave = readOnly ? undefined : saveDetails;
    const empty = readOnly ? false : showEmptyFields;
    switch (key) {
      case "logistics/flight_arrival":
        return <FlightArrivalDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "food/coffee":
      case "food/coffee_dessert":
        return <CoffeeDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "food/bar":
      case "food/cocktail_bar":
        return <CocktailBarDetail card={dCard} onSaveDetails={onSave} hideAddress showEmpty={empty} />;
      case "food/drinks":
        return <CocktailBarDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "food/restaurant":
        return <RestaurantDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "activity/self_directed":
        return <SelfDirectedDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "activity/guided":
      case "activity/hosted":
        return <GuidedDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "note":
        return readOnly ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {(dCard.details?.notes as string) ?? ""}
          </p>
        ) : (
          <NoteDetail notes={(localCard.details?.notes as string) ?? ""} onSave={(v) => saveDetails("notes", v)} />
        );
      case "activity/event":
        return <EventDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "activity/challenge":
        return <ChallengeDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "activity/beach":
        // Beaches want the same free-notes sheet a challenge used
        return <ChallengeDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "logistics/flight_departure":
        return <FlightArrivalDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "logistics/hotel":
        return <HotelDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "activity/wellness":
        return <WellnessDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      default:
        if (place?.type === "logistics") return <LogisticsDetail card={dCard} />;
        if (place?.type === "activity")  return <ActivityDetail  card={dCard} />;
        return <RestaurantDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
    }
  }

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
        {/* Cover photo hero — swipeable gallery (only when card is linked to a
            place). It stays pinned at the top: it is how you recognise the card
            you opened, and scrolling it away cost more than it gave back. What
            it gives up instead is height — 150 rather than 220, which is still
            a photograph and no longer a quarter of a phone screen. */}
        {place ? (
          <div className="relative w-full overflow-hidden">
            <PlacePhotoGallery
              key={place.id}
              placeId={place.id}
              hasGooglePhotos={!!place.google_place_id}
              fallbackLat={place.lat}
              fallbackLng={place.lng}
              title={place.title}
              height={photoHeight}
            />
            {/* Gradient overlay so drag handle is visible */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" style={{ zIndex: 20 }} />
            {/* Drag handle on top of photo */}
            <div className="absolute top-2.5 left-0 right-0 flex justify-center cursor-grab" style={{ zIndex: 21 }}>
              <div className="w-9 h-[3px] rounded-full bg-white/60" />
            </div>
          </div>
        ) : (
          <div className="relative w-full pt-2.5 flex justify-center cursor-grab">
            <div className="w-9 h-[3px] rounded-full bg-gray-200" />
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          {/* Top row: type badge + booking badge + [📍 Link] [🗑 Delete] [✕ Close] */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              {/* Type badge — tappable to change sub-type (only when linked to a place) */}
              <div className="relative">
                <button
                  onClick={readOnly ? undefined : () => place && setShowSubTypePicker((v) => !v)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${accent.bg} ${place && !readOnly ? "hover:opacity-80 active:opacity-70 transition-opacity cursor-pointer" : "cursor-default"}`}
                >
                  <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                  <span className={`text-[11px] font-semibold ${accent.text}`}>{typeLabel}</span>
                  {place && !readOnly && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={accent.text}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </button>
                {showSubTypePicker && place && !readOnly && (
                  <SubTypePicker
                    currentType={place.type}
                    currentSubType={place.sub_type ?? null}
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
              {/* Rating + price — badge row, right of type badge */}
              {(rating !== null && place?.sub_type !== "flight_arrival" && place?.sub_type !== "flight_departure" || badgePriceLabel) && (
                <div className="flex items-center mr-0.5" style={{ gap: 3 }}>
                  {rating !== null && place?.sub_type !== "flight_arrival" && place?.sub_type !== "flight_departure" && (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#B45309" stroke="none">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#B45309" }}>{rating.toFixed(1)}</span>
                    </>
                  )}
                  {rating !== null && place?.sub_type !== "flight_arrival" && place?.sub_type !== "flight_departure" && badgePriceLabel && (
                    <span style={{ color: "#D4CFC8", fontSize: 11 }}>·</span>
                  )}
                  {badgePriceLabel && (
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{badgePriceLabel}</span>
                  )}
                </div>
              )}
              {/* Paperclip — attachments (logistics and activity cards only) */}
              {!readOnly && (place?.type === "logistics" || place?.type === "activity") && (
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
              {!readOnly && localCard.status === "in_itinerary" && (
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
              {!readOnly && (
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
              )}
              {/* Move / Copy — occasional actions, so they live behind a ⋯
                  beside the icons that were already here rather than on a
                  shelf of their own. */}
              {!readOnly && localCard.status === "in_itinerary" && days && days.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowCardMenu((v) => !v)}
                    aria-expanded={showCardMenu}
                    aria-label="More actions"
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#6B7280">
                      <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
                    </svg>
                  </button>
                  {showCardMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCardMenu(false)} />
                      <div
                        role="menu"
                        className="absolute right-0 top-9 z-50 w-44 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
                      >
                        <button
                          role="menuitem"
                          onClick={() => { setShowCardMenu(false); setShowMovePicker(true); }}
                          className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Move to Day
                        </button>
                        <button
                          role="menuitem"
                          disabled={isCopying}
                          onClick={() => { setShowCardMenu(false); setShowCopyPicker(true); }}
                          className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100 disabled:opacity-50"
                        >
                          {isCopying ? "Copying…" : "Copy to another day"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
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

          {/* Title — editable when linked to a place (owner); static otherwise */}
          <div className="mt-2.5">
            {place && !readOnly ? (
              <TitleEditor
                value={place.title}
                onSave={(v) => saveTitle(v)}
              />
            ) : (
              <h2 className="text-[19px] font-bold text-gray-900 leading-snug">{displayTitle}</h2>
            )}
          </div>

          {/* Editable time row */}
          <div className="flex items-center gap-1 mt-1 flex-wrap -ml-2">
            {readOnly ? (
              /* Static time (guest) — no editable chips */
              localCard.start_time && (
                <span className="text-sm text-gray-700 font-medium px-2 py-0.5">
                  {formatTime(localCard.start_time)}
                  {localCard.end_time ? ` – ${formatTime(localCard.end_time)}` : ""}
                </span>
              )
            ) : (
              <>
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
              </>
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

          {/* The address used to sit here in grey, truncated mid-street. It
              cost a line of a phone screen to half-say what Maps says properly
              one tap away. */}

          {/* Action pills: We loved this · Maps · Website · Call · Menu */}
          {(showLoved || place?.lat != null && place.lng != null || (localCard.details as Record<string, unknown>)?.place_id != null || website || phone || place?.type === "food") && (
            <div className="flex flex-wrap items-center mt-3" style={{ gap: 6 }}>
              {/* "We loved this" — the only review that counts here. Unset it
                  is an ordinary pill; set, it collapses to the filled heart,
                  because a place you loved should not still be asking. */}
              {showLoved && (
                readOnly ? (
                  <span className="flex items-center" style={{ padding: "7px 2px" }}>
                    <LovedHeart size={15} />
                  </span>
                ) : (
                  // Just a heart. The worded pill spent a whole row saying what
                  // a heart already says, and it sat beside Maps/Website/Call
                  // as though it were another destination rather than a mark.
                  <button
                    onClick={toggleLoved}
                    aria-pressed={isLoved}
                    aria-label={isLoved ? "We loved this — tap to unset" : "We loved this"}
                    title={isLoved ? "We loved this" : "We loved this"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      borderRadius: 20,
                      border: isLoved ? "none" : "0.5px solid #E5E0D8",
                      background: isLoved ? "transparent" : "#fff",
                    }}
                  >
                    {isLoved ? (
                      <LovedHeart size={16} />
                    ) : (
                      <Heart size={14} weight="light" color="#4B5563" />
                    )}
                  </button>
                )
              )}
              {(place?.lat != null && place.lng != null || (localCard.details as Record<string, unknown>)?.place_id != null) && (
                <button
                  onClick={() => setNavSheetOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, border: "0.5px solid #E5E0D8", background: "#fff", fontSize: 11, color: "#4B5563" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, border: "0.5px solid #E5E0D8", background: "#fff", fontSize: 11, color: "#4B5563" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Website
                </a>
              )}
              {phone && (
                <a
                  href={phone.href}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, border: "0.5px solid #E5E0D8", background: "#fff", fontSize: 11, color: "#4B5563" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Call
                </a>
              )}
              {place?.type === "food" && (
                menuUrl ? (
                  <a
                    href={menuUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, border: "0.5px solid #E5E0D8", background: "#fff", fontSize: 11, color: "#4B5563" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="15" y2="18" />
                    </svg>
                    Menu
                  </a>
                ) : readOnly ? null : (
                  <button
                    onClick={() => { setShowMenuInput((v) => !v); setMenuInputValue(""); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, border: "0.5px solid #E5E0D8", background: "#fff", fontSize: 11, color: "#4B5563", opacity: 0.38 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="15" y2="18" />
                    </svg>
                    Menu
                  </button>
                )
              )}
            </div>
          )}
          {place?.type === "food" && !readOnly && showMenuInput && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="url"
                value={menuInputValue}
                onChange={(e) => setMenuInputValue(e.target.value)}
                placeholder="Paste menu URL…"
                autoFocus
                className="flex-1 px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-gray-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveMenuUrl();
                  if (e.key === "Escape") { setShowMenuInput(false); setMenuInputValue(""); }
                }}
              />
              <button
                onClick={saveMenuUrl}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-[#1A1A2E] text-white hover:opacity-90 transition-opacity"
              >
                Save
              </button>
              <button
                onClick={() => { setShowMenuInput(false); setMenuInputValue(""); }}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        </div>{/* end drag/header touch zone */}

        {/* Scrollable detail content */}
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 overflow-y-auto px-5 py-5">
            {/* Checklist — the card's own list of things to tick off, the
                Trello shape: many small checklists in context, not one long
                trip-level one. FIRST, not last: below the detail fields it
                sat under a long scroll in grey and was effectively hidden.
                A guest reads it; only the owner works it. */}
            <CardChecklist
              items={readChecklist(localCard.details)}
              onSave={readOnly ? undefined : saveChecklist}
            />

            {renderDetail()}

            {/* Recommended by — a person, not a rating. The map's add flow can
                set it at save time; this is where it gets added or corrected
                afterwards, so a place saved before you knew who sent you there
                can still be credited. Follows the sheet's field convention:
                hidden when empty until "Add details" is on. */}
            {place && (recommendedBy || (!readOnly && showEmptyFields)) && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <SectionLabel>Recommended by</SectionLabel>
                <FieldRow
                  value={recommendedBy}
                  placeholder="Who recommended this…"
                  onSave={readOnly ? undefined : saveRecommendedBy}
                />
              </div>
            )}

            {/* Full weekly hours — the deliberate lookup surface. Always shown
                when the place carries hours; absent for notes and hours-less places. */}
            {weekdayText && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={14} weight="light" className="text-activity/50" />
                  <span className="text-[12px] font-medium text-activity">Hours</span>
                </div>
                <ul className="space-y-1">
                  {weekdayText.map((line, i) => {
                    const idx = line.indexOf(": ");
                    const day = idx >= 0 ? line.slice(0, idx) : line;
                    const value = idx >= 0 ? line.slice(idx + 2) : "";
                    return (
                      <li key={i} className="flex justify-between gap-4 text-[12.5px] leading-snug">
                        <span className="text-activity/50">{day}</span>
                        <span className="text-activity/80 text-right">{value}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Confirmation toggle — guided activities, all logistics, restaurants */}
            {!readOnly && ((place?.type === "activity" && place.sub_type === "guided") ||
              place?.type === "logistics" ||
              (place?.type === "food" && place.sub_type === "restaurant")) && (
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

            {/* Add details / collapse toggle — owner only, not shown for notes */}
            {!readOnly && place && place.sub_type !== "note" && (
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

        {/* Bottom action area. Rendered only when it has something to say —
            an empty one still drew its top border and reserved padding, which
            is the shelf we just removed reappearing as a stripe. */}
        {(showDeleteConfirm
          || !!copyNotice
          || (!readOnly && localCard.status === "interested" && !!days && days.length > 0)) && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white">
          {/* Assign to Day — only for unplaced cards */}
          {!readOnly && localCard.status === "interested" && days && days.length > 0 && !showDeleteConfirm && (
            <div className="px-5 pt-4 pb-2">
              <button
                onClick={() => setShowDayPicker(true)}
                className="w-full py-3 rounded-xl bg-activity text-white text-[14px] font-bold active:scale-[0.98] transition-all"
              >
                Assign to Day
              </button>
            </div>
          )}

          {/* Move / Copy now live behind the ⋯ in the header. What they left
              behind is the confirmation, which becomes a toast: it has
              something to say for three seconds, not a permanent shelf. */}
          {copyNotice && !showDeleteConfirm && (
            <div className="px-5 pt-3 pb-3">
              <p className={`text-[12px] text-center font-medium ${copyNotice.ok ? "text-activity" : "text-red-500"}`}>
                {copyNotice.text}
              </p>
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
        )}

        {/* Attachments panel */}
        {showAttachments && (
          <AttachmentsPanel
            card={localCard}
            onClose={() => setShowAttachments(false)}
            onCardUpdate={(updated) => { setLocalCard(updated); onCardUpdate?.(updated); }}
          />
        )}

        {/* Link place sheet — a card with no linked place has no type, so the
            picker shows every saved place (null = no filter). */}
        {showLinkSheet && (
          <div className="absolute inset-0 z-10">
            <LinkPlaceSheet
              mode="link"
              tripId={localCard.trip_id}
              cardType={place?.type ?? null}
              onLink={handleLinkPlace}
              onClose={() => setShowLinkSheet(false)}
            />
          </div>
        )}

        {/* Move to day picker overlay */}
        {showMovePicker && days && (
          <DayPickerOverlay
            title="Move to day"
            days={days}
            currentDayId={localCard.day_id}
            onSelect={handleMoveToDay}
            onClose={() => setShowMovePicker(false)}
          />
        )}

        {/* Copy to day picker overlay — same list, different verb */}
        {showCopyPicker && days && (
          <DayPickerOverlay
            title="Copy to day"
            days={days}
            currentDayId={localCard.day_id}
            onSelect={handleCopyToDay}
            onClose={() => setShowCopyPicker(false)}
          />
        )}

        {/* Day picker overlay */}
        {showDayPicker && days && (
          <DayPickerOverlay
            title="Assign to day"
            days={days}
            onSelect={handleAssignToDay}
            onClose={() => setShowDayPicker(false)}
          />
        )}
      </div>
    </div>

    <NavigationSheet
      isOpen={navSheetOpen}
      onClose={() => setNavSheetOpen(false)}
      placeName={place?.title ?? displayTitle}
      placeId={(localCard.details as Record<string, unknown>)?.place_id as string | undefined}
      lat={place?.lat ?? null}
      lng={place?.lng ?? null}
    />
    </>
  );
}
