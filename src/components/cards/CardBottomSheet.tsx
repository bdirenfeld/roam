"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { SUB_TYPE_LABEL } from "@/lib/subTypeLabel";
import TimeSheet from "@/components/day/TimeSheet";
import { CaretDown, Clock, Heart } from "@phosphor-icons/react";
import type { Card, ChecklistItem, Day, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { queuedUpdate, queuedDelete } from "@/lib/offline/queuedWrite";
import { applyOverlay } from "@/lib/offline/writeQueue";
import { formatTimeValue } from "@/lib/formatTime";
import { scheduleCardOnDay, unscheduleCard } from "@/lib/scheduleCard";
import LovedHeart from "@/components/ui/LovedHeart";
import { readRecommendedBy } from "@/lib/recommendedBy";
import FieldRow, { SectionLabel, NoteDisplay } from "./detail/FieldRow";
import { withoutHoursLine } from "@/lib/plan/notes";
import LinkPlaceSheet from "@/components/plan/LinkPlaceSheet";
import dynamic from "next/dynamic";
import { reloadOnStale } from "@/lib/chunkReload";
// Phone speed (5 Oct 2026): booking sheets load when opened, not with the day.
const AttachmentsPanel = dynamic(reloadOnStale(() => import("./AttachmentsPanel")), { ssr: false });
import CardChecklist from "./CardChecklist";
import { readChecklist } from "./cardChecklistModel";
import DayPickerOverlay from "./DayPickerOverlay";
import RepeatDaysOverlay from "./RepeatDaysOverlay";
import PlacePhotoGallery from "./PlacePhotoGallery";
import { NavigationSheet } from "@/components/ui/NavigationSheet";
import { type DirectionsApp, directionsUrl, otherApp, readDirectionsApp, writeDirectionsApp } from "@/lib/directions";

// ── Type-specific detail components ───────────────────────────
import FlightArrivalDetail from "./detail/FlightArrivalDetail";
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
import { withDetails } from "@/lib/cardDetails";
import { UNTITLED_NOTE, cardTitle, deletedToast } from "@/lib/cardTitle";
import TravelLegPanel, { useDefaultFrom } from "./TravelLegPanel";
import { canBeLeg, isTravelLeg, legTitle, legDurationMins, legModeWord, readFrom, readMode, withFrom, type LegFrom, type LegMode } from "@/lib/travel/leg";

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
  /** `takenOff` when the card came off its day (the place stays saved; `savedId` is the saved copy made for it, if one was). */
  onCardDelete?: (cardId: string, takenOff?: { savedId: string | null }) => void;
  /** Called with the NEW card written by "Copy to another day". The card this
   *  sheet is showing is unchanged — the caller splices the new one into the
   *  target day so the board/agenda updates without a refetch. */
  onCardCopied?: (card: Card) => void;
  /** Days available for assignment (shows "Assign to day" when card is interested) */
  days?: Day[];
  /** Trip destination string (e.g. "Rome, Italy") — used to derive country dial code */
  tripDestination?: string;
  /** Guest view — render every section read-only; no edit/add/delete/move
   *  controls, no editable fields, and the confirmation reference is hidden. */
  readOnly?: boolean;
  /** A hotel's check-out as the host worked it out (lib/stays/stayRuns), so
   *  the sheet says the same day the week's band does when none is written. */
  stayCheckOut?: string | null;
  /** Opened from the Add-a-place sheet (6 Oct 2026, taps audit): the button
   *  reads "Add to <label>" and runs the row's own Add, then closes back to
   *  the sheet. Without it, "Put on a day" asks for the day as before. */
  addToDay?: { label: string; onAdd: () => Promise<boolean> };
}

/** Drop the booking/flight confirmation reference so it never renders for a
 *  guest. Other facts (meeting point, includes, contact, transport) are kept. */
function withoutConfirmation(details: Card["details"]): Card["details"] {
  const rest = { ...details };
  delete (rest as Record<string, unknown>).confirmation;
  return rest;
}

// ── Sub-type display labels ────────────────────────────────────
// One table for the names (lib/subTypeLabel): this copy said "Self-Directed"
// and "Guided" where every other screen said Explore and Tour (27 Sep 2026).

// ── Category options (top level of two-level picker) ──────────
const CATEGORY_OPTIONS = [
  { value: "food",      label: "Food"      },
  { value: "activity",  label: "Activity"  },
  { value: "logistics", label: "Logistics" },
] as const;

// ── Sub-type options per parent type ──────────────────────────
const SUB_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  activity: [
    { value: "guided",        label: "Tour"          },
    { value: "challenge",     label: "Race"          },
    { value: "self_directed", label: "Explore"        },
    { value: "wellness",      label: "Wellness"       },
    { value: "event",         label: "Event"          },
    { value: "beach",         label: "Beach"          },
    { value: "camp",          label: "Camp"           },
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
    { value: "pet_care",         label: "Pet care"         },
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

/** Notes as stored, for a card with no Hours row. */
const identityNote = (s: string) => s;

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
/** "09:30" + 90 → "11:00". Wraps past midnight; returns null on bad input. */

const isDirections = (u: string) => u.startsWith("https://www.google.com/maps/dir/");

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
/** The top row's 28px discs, finger-sized without looking it (6 Oct 2026,
 *  taps audit): 44 tall into the header's 12px padding, and only 3px each
 *  side — half the 6px gap — so no disc's target reaches its neighbour. */
const DISC_TARGET = "absolute -inset-x-[3px] -inset-y-2";

export default function CardBottomSheet({ card, onClose, onCardUpdate, onCardDelete, onCardCopied, days, tripDestination, readOnly = false, stayCheckOut = null, addToDay }: Props) {
  // Every field save reverts on refusal; it also says so now (UX audit,
  // Sep 2026, finding 1). Before, eight sites logged to the console only.
  const { toast } = useToast();
  const supabase = createClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Axis lock for the photo hero: a touch starts "pending" and only commits to
  // a vertical sheet drag once the gesture has moved far enough to reveal its
  // intent. A horizontally-dominant swipe releases the sheet entirely so the
  // gallery's native scroll-snap owns it — otherwise a diagonal photo swipe
  // drags the sheet down and >120px of drift dismisses it mid-swipe.

  // Local optimistic state
  // Queued-but-unsent edits are laid over the incoming row on open. The Day
  // view already does this for its list, but the sheet is also opened from the
  // Plan board, whose cards come straight from the cached page payload.
  const [localCard, setLocalCard] = useState<Card>(() => withDetails(applyOverlay("cards", card)));
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
  const [showLinkSheet,     setShowLinkSheet]     = useState(false);
  const [showAttachments,   setShowAttachments]   = useState(false);
  const [showEmptyFields,   setShowEmptyFields]   = useState(false);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  // Deleted, but the sheet is still up so the undo is under the same thumb
  // that pressed delete. See handleDelete.
  const [justDeleted, setJustDeleted] = useState(false);
  const [linkMergeMessage,  setLinkMergeMessage]  = useState<string | null>(null);
  const [navSheetOpen,      setNavSheetOpen]      = useState(false);
  const [addingToDay,       setAddingToDay]       = useState(false);
  // The remembered directions app (6 Oct 2026, taps audit). Read after mount:
  // localStorage never decides the server render.
  const [navApp,            setNavApp]            = useState<DirectionsApp | null>(null);
  useEffect(() => { setNavApp(readDirectionsApp()); }, []);

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

  // Drag-to-dismiss lives in useSheetDrag, shared with every other sheet.
  // scrollRef is handed over because this sheet scrolls an inner body under a
  // pinned hero — asking the sheet for its own scrollTop would read 0 forever
  // and claim every downward swipe as a dismissal.
  const drag = useSheetDrag(onClose, scrollRef);
  // The time is set in the same quick sheet the agenda's chip opens — one
  // time control everywhere (Brennan, Sep 2026). Start and end are written
  // together so a half-saved pair can never show.
  const [timeOpen, setTimeOpen] = useState(false);
  const saveTimes = useCallback(async (start: string | null, end: string | null) => {
    const prev = localCard;
    const next = { start_time: start ? toDbTime(start) : null, end_time: end ? toDbTime(end) : null };
    const updated = { ...localCard, ...next };
    setLocalCard(updated);
    onCardUpdate?.(updated);
    const { error } = await queuedUpdate("cards", { id: localCard.id }, next);
    if (error) {
      toast({ message: "Couldn't save the time. Try again." });
      setLocalCard(prev);
      onCardUpdate?.(prev);
    }
  }, [localCard, onCardUpdate, toast]);

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
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, toast]
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
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, saveTopLevel, toast]
  );

  // ── Travel leg (7 Oct 2026, mock d13) ─────────────────────────
  // Several details keys in one write (from + mode + a named title), which
  // saveDetails' one-field-at-a-time closure would lose to itself.
  const saveDetailsPatch = useCallback(
    async (next: Record<string, unknown>) => {
      const prev = localCard;
      const updated = { ...localCard, details: next as Card["details"] };
      setLocalCard(updated);
      onCardUpdate?.(updated);
      const { error } = await queuedUpdate("cards", { id: localCard.id }, { details: next });
      if (error) {
        console.error("Failed to save the leg.", error.message);
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, toast]
  );
  const legCapable = canBeLeg(localCard.place);
  const legFrom = readFrom(localCard.details);
  // Last night's stay, offered as the start of a transit card that has none.
  const legSuggestion = useDefaultFrom(localCard.trip_id, localCard.day_id, legCapable && !readOnly);


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
      toast({ message: "Couldn't save that. Try again." });
      setLocalCard(prev);
      onCardUpdate?.(prev);
    }
  }, [localCard, onCardUpdate, supabase, toast]);

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
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase, toast],
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
    const { error } = await queuedDelete("cards", { id: localCard.id });
    setIsDeleting(false);
    if (error) {
      setDeleteError("Couldn't delete — please try again.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }
    // The host removes the card and raises the undo toast, which is z-[80]
    // against this sheet's z-60 — it was always drawn ON TOP, and the only
    // reason it was never usable from here is that the sheet closed itself the
    // instant delete succeeded, dropping the traveller onto the board with the
    // undo somewhere behind them (Brennan, Sep 7 2026).
    //
    // So: hold the sheet open for the toast's own six seconds. Undo lands
    // where the finger already is. The sheet closes afterwards either way — if
    // it was undone, the card is back on the board to be reopened; if it was
    // not, there is nothing here to show.
    onCardDelete?.(localCard.id);
    setJustDeleted(true);
  }, [localCard.id, onCardDelete, supabase]);

  useEffect(() => {
    if (!justDeleted) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [justDeleted, onClose]);

  // ── Take off this day ────────────────────────────────────────
  // The card leaves the day and the place stays saved (a saved copy is written
  // if none exists). From the host's point of view this is a delete, so the
  // host's six-second undo covers it. Before this, the only way off a day on a
  // phone was deleting the card outright (click audit, batch 5).
  const handleUnschedule = useCallback(async () => {
    setIsDeleting(true);
    const { ok, created } = await unscheduleCard(supabase, localCard);
    setIsDeleting(false);
    if (!ok) {
      setDeleteError("Couldn't take it off the day — please try again.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }
    // Said as a take-off, so the host's toast doesn't call it a delete (6 Oct 2026, taps audit).
    onCardDelete?.(localCard.id, { savedId: created?.id ?? null });
    onClose();
  }, [localCard, onCardDelete, onClose, supabase]);

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
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
      }
    },
    [localCard, onCardUpdate, supabase, toast],
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
        toast({ message: "Couldn't save that. Try again." });
        setLocalCard(prev);
        onCardUpdate?.(prev);
        return;
      }
      // The card is now on another day; the sheet closes the way the map
      // popup's "Add to day" does, instead of staying open on a card that has
      // left the column you were looking at.
      onClose();
    },
    [localCard, onCardUpdate, onClose, supabase, toast],
  );

  // ── Repeat on other days (27 Sep 2026) ─────────────────────
  // Copy to every ticked day at once — a day camp is the same card on each
  // weekday. One toast, one Undo for the lot.
  const handleRepeat = useCallback(
    async (targets: Day[]) => {
      setShowCopyPicker(false);
      if (isCopying || targets.length === 0) return;
      setIsCopying(true);
      const made: Card[] = [];
      for (const day of targets) {
        if (day.id === localCard.day_id) continue;
        const created = await scheduleCardOnDay(supabase, {
          tripId: localCard.trip_id, dayId: day.id, placeId: localCard.place_id, place: localCard.place ?? null,
          details: localCard.details, startTime: localCard.start_time, endTime: localCard.end_time, sourceUrl: localCard.source_url,
        });
        if (created) { made.push(created); onCardCopied?.(created); }
      }
      setIsCopying(false);
      const missed = targets.length - made.length;
      toast({
        duration: 12000,
        message: missed ? `On ${made.length} more ${made.length === 1 ? "day" : "days"}; ${missed} couldn't be added` : `On ${made.length} more ${made.length === 1 ? "day" : "days"}`,
        undo: made.length ? async () => {
          for (const c of made) { await queuedDelete("cards", { id: c.id }); onCardDelete?.(c.id); }
        } : undefined,
      });
    },
    [localCard, isCopying, onCardCopied, onCardDelete, supabase, toast],
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
          toast({ message: "Couldn't save that. Try again." });
          setLocalCard(prev);
          onCardUpdate?.(prev);
        }
      }
    },
    [localCard, onCardUpdate, supabase, toast],
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
          toast({ message: "Couldn't save that. Try again." });
          setLocalCard(prev);
          onCardUpdate?.(prev);
        }
      }
    },
    [localCard, onCardUpdate, supabase, toast],
  );

  // ── Derived display values ─────────────────────────────────
  const place     = localCard.place ?? null;
  const isNote    = place == null;
  const det       = localCard.details as Record<string, unknown>;
  const noteSnippet = isNote ? (det?.notes as string | undefined) : undefined;
  const displayTitle = cardTitle(localCard) === UNTITLED_NOTE && noteSnippet ? noteSnippet.slice(0, 60) : cardTitle(localCard); // "A note", was "(untitled note)" (6 Oct 2026, delight audit)
  // Where the directions go. The place's own Google id first, so the route
  // lands on the right door (6 Oct 2026, taps audit).
  const navTarget = {
    placeName: place?.title ?? displayTitle,
    placeId: place?.google_place_id ?? (det?.place_id as string | undefined) ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    address: place?.address ?? null,
  };
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

  // Shut by default; opening it is a deliberate lookup.
  const [hoursOpen, setHoursOpen] = useState(false);

  // The line for the day this card sits on — "Tuesday: 9:00 AM – 6:00 PM" —
  // which is the one line worth showing while the rest stay folded. Google
  // names the days in English and readWeekdayText keeps that naming, so the
  // match is on the same vocabulary. A dateless card (a saved place, not yet on
  // a day) simply has no line to show.
  const cardDayLine = (() => {
    if (!weekdayText) return null;
    const date = days?.find((d) => d.id === localCard.day_id)?.date;
    if (!date) return null;
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return null;
    // Built from parts, not Date.parse: "2026-03-15" parses as UTC and can land
    // on the previous weekday west of Greenwich.
    const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
    const line = weekdayText.find((l) => l.startsWith(weekday + ":"));
    if (!line) return null;
    return { weekday, value: line.slice(weekday.length + 2).trim() };
  })();

  const priceLevel = place?.price_level ?? null;

  const badgePriceLabel = place?.type === "food" && priceLevel != null
    ? (["Free", "€", "€€", "€€€", "€€€€"] as const)[priceLevel] ?? null
    : null;

  const badge = bookingBadge(localCard.details);
  // Booked lives in the ⋯ (6 Oct 2026, designer audit): set once per
  // reservation, so it does not earn a row on the surface. Same write as the
  // old switch — cards.confirmed through saveTopLevel — so the row's Booked
  // badge, the Estimate and Re-plan (which leaves booked cards alone) read it
  // exactly as before.
  const canBook = !readOnly && ((place?.type === "activity" && place.sub_type === "guided") ||
    place?.type === "logistics" ||
    (place?.type === "food" && place.sub_type === "restaurant"));
  const canMove = !readOnly && localCard.status === "in_itinerary" && !!days && days.length > 0;

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
        // Coffee, bar and restaurant shared one byte-identical component under
        // three names (simplification audit, Sep 2026); one file now.
        return <RestaurantDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "food/bar":
      case "food/cocktail_bar":
        return <RestaurantDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      case "food/drinks":
        return <RestaurantDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
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
        return <HotelDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} stayCheckOut={stayCheckOut} />;
      case "activity/wellness":
        return <WellnessDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
      default:
        if (place?.type === "logistics") return <LogisticsDetail card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
        if (place?.type === "activity")  return <ActivityDetail  card={dCard} onSaveDetails={onSave} showEmpty={empty} />;
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
        ref={drag.sheetRef}
        onClick={(e) => e.stopPropagation()}
        // Swipe-to-dismiss is bound to the whole sheet, not just the handle —
        // you shouldn't have to find a 40px strip to close a card. The body
        // still scrolls: the drag is only claimed when it's already at the top.
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet h-[95dvh] max-h-[95dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 ease-spring"
        style={{ willChange: "transform" }}
      >
        {/* Close. On the sheet rather than in the header row, so it sits over
            the photograph and costs no line — white on the cover's gradient,
            ink on a note card, which has no photo to sit on. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
          style={place
            ? { zIndex: 30, color: "#fff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))" }
            : { zIndex: 30, color: "rgba(26,26,46,0.45)" }}
        >
          {/* 44px to the finger, 36 to the eye (6 Oct 2026, taps audit). A note
              card's ⋯ keeps 40px clear of this corner, so it never overlaps. */}
          <span aria-hidden="true" data-testid="sheet-close-target" className="absolute -inset-1" />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="flex-shrink-0">
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
              {/* Loved, website, call, menu — the pill row's worth, as glyphs.
                  Worded pills spent a whole row saying what these shapes say,
                  and sat beside each other as though a heart and a phone number
                  were the same kind of thing. */}
              {showLoved && (
                readOnly ? (
                  <span className="w-7 h-7 flex items-center justify-center"><LovedHeart size={15} /></span>
                ) : (
                  <button
                    onClick={toggleLoved}
                    aria-pressed={isLoved}
                    aria-label={isLoved ? "We loved this — tap to unset" : "We loved this"}
                    title="We loved this"
                    className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <span aria-hidden="true" data-testid="sheet-disc-target" className={DISC_TARGET} />
                    {isLoved ? <LovedHeart size={15} /> : <Heart size={14} weight="light" color="#6B7280" />}
                  </button>
                )
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  title="Website"
                  className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <span aria-hidden="true" className={DISC_TARGET} />
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </a>
              )}
              {phone && (
                <a href={phone.href} aria-label="Call" title={phone.display} className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <span aria-hidden="true" className={DISC_TARGET} />
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </a>
              )}
              {/* Paperclip — attachments (logistics and activity cards only) */}
              {!readOnly && (place?.type === "logistics" || place?.type === "activity") && (
                <button
                  onClick={() => setShowAttachments(true)}
                  className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  aria-label="Attachments"
                >
                  <span aria-hidden="true" className={DISC_TARGET} />
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              )}
              {!readOnly && localCard.status === "in_itinerary" && (
                <button
                  onClick={() => setShowLinkSheet(true)}
                  className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  aria-label="Link place from map"
                >
                  <span aria-hidden="true" className={DISC_TARGET} />
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </button>
              )}
              {/* Move / Copy / Take off this day — behind the ⋯. Brennan tried
                  Move and Take-off as header buttons (Sep 2026) and found the
                  row cluttered, so the header keeps its glyphs and the verbs
                  live here. The sheet still closes itself after a move. */}
              {(canMove || canBook) && (
                <div className={place ? "relative" : "relative mr-10" /* a note card has the ✕ in this corner: keep the ⋯ clear of it (Brennan, 25 Sep 2026) */}>
                  <button
                    onClick={() => setShowCardMenu((v) => !v)}
                    aria-expanded={showCardMenu}
                    aria-label="More options"
                    className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <span aria-hidden="true" className={DISC_TARGET} />
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
                        {canMove && days && days.length > 1 && (
                          <button
                            role="menuitem"
                            onClick={() => { setShowCardMenu(false); setShowMovePicker(true); }}
                            className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Move to day
                          </button>
                        )}
                        {canMove && days && days.length > 1 && (
                          <button
                            role="menuitem"
                            disabled={isCopying}
                            onClick={() => { setShowCardMenu(false); setShowCopyPicker(true); }}
                            className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100 disabled:opacity-50"
                          >
                            {isCopying ? "Copying…" : "Repeat on other days"}
                          </button>
                        )}
                        {canMove && onCardDelete && (
                          <button
                            role="menuitem"
                            disabled={isDeleting}
                            onClick={() => { setShowCardMenu(false); void handleUnschedule(); }}
                            className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100 disabled:opacity-50"
                          >
                            Take off this day
                          </button>
                        )}
                        {canBook && (
                          /* "Booked", not "Confirmed": it names what you did.
                             The column stays `confirmed`. The menu stays open
                             so the switch is seen to move. */
                          <button
                            role="menuitemcheckbox"
                            aria-checked={!!localCard.confirmed}
                            onClick={() => saveTopLevel("confirmed", !localCard.confirmed)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors${canMove ? " border-t border-gray-100" : ""}`}
                          >
                            Booked
                            <span aria-hidden style={{
                              width: 34, height: 19, borderRadius: 10,
                              backgroundColor: localCard.confirmed ? "#1A1A2E" : "#E5E7EB",
                              transition: "background-color 200ms",
                              position: "relative", flexShrink: 0, display: "inline-block",
                            }}>
                              <span style={{
                                position: "absolute", top: 2,
                                left: localCard.confirmed ? 17 : 2,
                                width: 15, height: 15, borderRadius: "50%",
                                backgroundColor: "white",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                                transition: "left 200ms",
                              }} />
                            </span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Title — editable when linked to a place (owner); static otherwise */}
          <div className="mt-2.5">
            {isTravelLeg(localCard) ? (
              // A leg's title is its route, "Lusaka → Mfuwe"; renaming it would
              // rename the place it ends at. Change the start below instead.
              <h2 className="text-[19px] font-bold text-gray-900 leading-snug">{legTitle(localCard)}</h2>
            ) : place && !readOnly ? (
              <TitleEditor
                value={place.title}
                onSave={(v) => saveTitle(v)}
              />
            ) : (
              <h2 className="text-[19px] font-bold text-gray-900 leading-snug">{displayTitle}</h2>
            )}
            {/* The address, in words. The sheet had Maps, Website and Call
                buttons but never said where the place was — on a journey
                spanning eight towns that is the first thing you want. The
                country is dropped; the town is the point. */}
            {place?.address && (
              (place.lat != null && place.lng != null) || (localCard.details as Record<string, unknown>)?.place_id != null ? (
                /* The address IS the Maps button now. It was already printed
                   here doing nothing, and the pill it replaces opened this same
                   chooser. Underlined on hover only: it should read as the
                   address first and a control second. */
                <>
                <button
                  type="button"
                  onClick={() => {
                    // Remembered app: straight to the route, no chooser.
                    const url = navApp ? directionsUrl(navApp, navTarget) : null;
                    if (url) window.open(url, "_blank");
                    else setNavSheetOpen(true);
                  }}
                  aria-label={`Directions to ${place.address}`}
                  title="Directions"
                  className="block text-left text-[12.5px] leading-snug mt-1 hover:underline"
                  style={{ color: "rgba(26,26,46,0.62)" }}
                >
                  {place.address.replace(/,\s*[^,]+$/, "")}
                </button>
                {navApp && directionsUrl(otherApp(navApp), navTarget) && (
                  /* The way out of a remembered choice (6 Oct 2026, taps
                     audit): opens the other app once and remembers it. */
                  <button
                    type="button"
                    onClick={() => {
                      const next = otherApp(navApp);
                      const url = directionsUrl(next, navTarget);
                      if (url) window.open(url, "_blank");
                      writeDirectionsApp(next);
                      setNavApp(next);
                    }}
                    className="block text-left text-[11.5px] leading-snug mt-0.5 underline underline-offset-2"
                    style={{ color: "rgba(26,26,46,0.5)" }}
                  >
                    {navApp === "google" ? "Use Waze instead" : "Use Google Maps instead"}
                  </button>
                )}
                </>
              ) : (
                <p className="text-[12.5px] leading-snug mt-1" style={{ color: "rgba(26,26,46,0.62)" }}>
                  {place.address.replace(/,\s*[^,]+$/, "")}
                </p>
              )
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
              <button
                type="button"
                onClick={() => setTimeOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-black/[0.02]"
                style={{ background: "#F7F7F9", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)" }}
                aria-label={localCard.start_time ? "Change the time" : "Set a time"}
              >
                <Clock size={13} weight="light" color="#1A1A2E" />
                {localCard.start_time ? (
                  <span className="text-[13px] font-medium text-[#1A1A2E]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {formatTimeValue(localCard.start_time)}
                    {localCard.end_time ? ` – ${formatTimeValue(localCard.end_time)}` : ""}
                  </span>
                ) : (
                  <span className="text-[13px] italic" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "rgba(26,26,46,0.45)" }}>
                    Set a time
                  </span>
                )}
              </button>
            )}

            {/* No duration beside the times (6 Oct 2026, designer audit): the
                range already says it. */}

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
                  aria-label={isDirections(localCard.source_url) ? "Directions" : "Source"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {/* A travel card links to the route (lib/plan/gettingThere). */}
                  {isDirections(localCard.source_url) ? "Directions" : "Source"}
                </a>
              </>
            )}
          </div>

          {/* The address used to sit here in grey, truncated mid-street. It
              cost a line of a phone screen to half-say what Maps says properly
              one tap away. */}

        </div>
        </div>{/* end drag/header touch zone */}

        {/* Scrollable detail content */}
        <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-5 py-5">
            <NoteDisplay.Provider value={weekdayText ? withoutHoursLine : identityNote}>
              {legCapable && place && (!readOnly || legFrom) && (
                <TravelLegPanel
                  from={legFrom}
                  to={(() => { const t = legTitle(localCard); return legFrom && t.includes("→") ? t.slice(t.indexOf("→") + 1).trim() : place.title; })()}
                  mode={readMode(localCard.details)}
                  modeLabel={legFrom ? legModeWord(localCard.details) : null}
                  durationMins={legFrom ? legDurationMins(localCard) : null}
                  suggestion={legSuggestion}
                  readOnly={readOnly}
                  biasLat={place.lat}
                  biasLng={place.lng}
                  onFromChange={(f: LegFrom) => void saveDetailsPatch(withFrom(localCard.details, f))}
                  onModeChange={(m: LegMode) => {
                    // A mode chosen by hand replaces the tour's words for it;
                    // a tap on the one already chosen changes nothing.
                    if (m === (readMode(localCard.details) ?? "drive")) return;
                    const next: Record<string, unknown> = { ...(localCard.details as Record<string, unknown>), mode: m };
                    delete next.mode_label;
                    void saveDetailsPatch(next);
                  }}
                />
              )}
              {renderDetail()}
            </NoteDisplay.Provider>

            {/* Notes, always reachable. The detail components render notes
                when there are any and hide the empty row until "Add details"
                is on; this row fills that gap so a first note is one tap, not
                a hunt for the gate. It steps aside when the component's own
                empty row is showing, so the field never appears twice. */}
            {place && !readOnly && !showEmptyFields && !(localCard.details as { notes?: string } | null)?.notes && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <FieldRow
                  value=""
                  placeholder="Add a note…"
                  multiline
                  onSave={(v) => saveDetails("notes", v.trim())}
                />
              </div>
            )}

            {/* Checklist — the card's own list of things to tick off, the
                Trello shape: many small checklists in context, not one long
                trip-level one. Below the notes (Brennan, 25 Sep 2026): the note
                is what you read first; the list is what you work through.
                A guest reads it; only the owner works it.
                A card WITHOUT one shows nothing here: the empty "Add a
                checklist" row is an empty field, and empty fields wait behind
                "Add details" like Recommended by (Brennan, 24 Sep 2026). */}
            {(() => {
              const items = readChecklist(localCard.details);
              const has = items !== null && items.length > 0;
              if (!has && (readOnly || !showEmptyFields)) return null;
              return <CardChecklist items={items} onSave={readOnly ? undefined : saveChecklist} />;
            })()}

            {/* Recommended by — a person, not a rating. The map's add flow can
                set it at save time; this is where it gets added or corrected
                afterwards, so a place saved before you knew who sent you there
                can still be credited. Follows the sheet's field convention:
                hidden when empty until "Add details" is on. */}
            {/* Shown when set, or when "Add details" is on. Brennan tried it
                always-on (Sep 2026) and found the card cluttered; the casual
                place to add a recommender is the map popup, which edits it
                inline. */}
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

            {/* Weekly hours, folded. Six of the seven lines are about days you
                are not there, so the row opens showing only the day this card
                sits on and expands to the week on a tap. */}
            {weekdayText && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setHoursOpen((v) => !v)}
                  aria-expanded={hoursOpen}
                  className="w-full flex items-center gap-1.5 mb-2 text-left"
                >
                  <Clock size={14} weight="light" className="text-activity/50" />
                  <span className="text-[12px] font-medium text-activity">Hours</span>
                  {!hoursOpen && cardDayLine && (
                    <span className="text-[12.5px] text-activity/60 truncate ml-1">
                      {cardDayLine.value}
                    </span>
                  )}
                  <CaretDown
                    size={12}
                    weight="bold"
                    className="ml-auto text-activity/40 flex-shrink-0"
                    style={{ transform: hoursOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
                  />
                </button>
                <ul className="space-y-1" hidden={!hoursOpen}>
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

            {/* The Booked switch moved into the ⋯ menu at the top (6 Oct 2026). */}

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

            {/* Delete, at the end of everything. It used to be a trash glyph in
                the header between the paperclip and the phone number, which is
                one slip from losing a card you meant to call. Down here you
                have to arrive at it. Still instant — every host has a six-second
                undo, and a confirm dialog would be a second, stricter model for
                one act. */}
            {!readOnly && justDeleted ? (
              <p className="mt-7 w-full py-3 text-center text-[13px] font-medium" style={{ color: "rgba(26,26,46,0.45)" }}>
                {deletedToast(localCard)} — undo above{/* named, was "Card deleted" (6 Oct 2026, delight audit) */}
              </p>
            ) : !readOnly ? (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="mt-7 w-full py-3 rounded-xl border border-[rgba(26,26,46,0.10)] text-[13px] font-medium
                           text-[rgba(26,26,46,0.45)] hover:text-red-500 hover:border-red-200 hover:bg-red-50/50
                           disabled:opacity-40 transition-colors"
              >
                {isDeleting ? "Deleting…" : "Delete card"}
              </button>
            ) : null}
          </div>
          {/* Gradient fade to hint at more content below */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>

        {/* Bottom action area. Rendered only when it has something to say —
            an empty one still drew its top border and reserved padding, which
            is the shelf we just removed reappearing as a stripe. */}
        {(!!deleteError
          || (!readOnly && localCard.status === "interested" && !!days && days.length > 0)) && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white">
          {/* Assign to Day — only for unplaced cards */}
          {!readOnly && localCard.status === "interested" && days && days.length > 0 && (
            <div className="px-5 pt-4 pb-2">
              {addToDay ? (
                /* From the add sheet the day is already known (6 Oct 2026,
                   taps audit): one tap adds, then back to the sheet. */
                <button
                  onClick={async () => {
                    if (addingToDay) return;
                    setAddingToDay(true);
                    const ok = await addToDay.onAdd();
                    setAddingToDay(false);
                    if (ok) onClose();
                  }}
                  disabled={addingToDay}
                  className="w-full py-3 rounded-xl bg-activity text-white text-[14px] font-bold active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  Add to {addToDay.label}
                </button>
              ) : (
              <button
                onClick={() => setShowDayPicker(true)}
                className="w-full py-3 rounded-xl bg-activity text-white text-[14px] font-bold active:scale-[0.98] transition-all"
              >
                Put on a day
              </button>
              )}
            </div>
          )}

          {/* The delete-confirm panel that used to live here is gone: delete is
              instant with the host's undo (one model everywhere, simplification
              audit). Only the error line survives, for a failed delete. */}
          {deleteError && (
            <p className="text-[11px] text-red-500 text-center px-5 py-3">{deleteError}</p>
          )}
        </div>
        )}

        {/* Attachments panel */}
        {showAttachments && (
          <AttachmentsPanel
            card={localCard}
            onClose={() => setShowAttachments(false)}
            onCardUpdate={(updated) => { setLocalCard(updated); onCardUpdate?.(updated); }}
            // A booking's check-out and the rest of its package land on other
            // days: the host splices them in as it does a copied card.
            onCardsAdded={(cards) => cards.forEach((c) => onCardCopied?.(c))}
          />
        )}

        {/* Link place sheet — a card with no linked place has no type, so the
            picker shows every saved place (null = no filter). */}
        {showLinkSheet && (
          <div className="absolute inset-0 z-30">
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
          <RepeatDaysOverlay
            days={days}
            currentDayId={localCard.day_id}
            onConfirm={handleRepeat}
            onClose={() => setShowCopyPicker(false)}
          />
        )}

        {/* Day picker overlay */}
        {showDayPicker && days && (
          <DayPickerOverlay
            title="Put on a day"
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
      placeName={navTarget.placeName}
      placeId={navTarget.placeId}
      lat={navTarget.lat}
      lng={navTarget.lng}
      address={navTarget.address}
      onRemember={setNavApp}
    />
      {timeOpen && (
        <TimeSheet card={localCard} onClose={() => setTimeOpen(false)} onSave={saveTimes} />
      )}
    </>
  );
}
