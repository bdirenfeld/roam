"use client";

import { useState, useCallback, useRef, useEffect, useMemo, createContext, useContext } from "react";
import { subTypeLabel } from "@/lib/subTypeLabel";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  KeyboardCoordinateGetter,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { queuedInsert, queuedDelete } from "@/lib/offline/queuedWrite";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import CardBadges from "@/components/cards/CardBadges";
import LinkPlaceSheet from "@/components/plan/LinkPlaceSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import ConfirmationPreviewSheet, { type ParsedConfirmation } from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import { JourneyNotesSheet } from "@/components/trip/JourneyNotes";
import DayPicker from "@/components/day/DayPicker";
// BoardBg type (kept local — no longer uses external BoardBgPicker)
type BoardBg =
  | { type: "color"; value: string }
  | { type: "photo"; url: string; thumb: string };
import type { Trip, Card, Day, DayWithCards, ListWithCards, CardType, CardStatus } from "@/types/database";
import {
  groupDaysIntoWeeks,
  shouldShowWeeks,
  weekSlotWidth,
  readFoldedDays,
  writeFoldedDays,
  readCollapsedLists,
  writeCollapsedLists,
  COL_W,
  type PlanWeek,
} from "@/lib/planWeeks";
import { nextPositionForDay, nextPositionForList } from "@/lib/scheduleCard";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { formatTimeRange } from "@/lib/formatTime";
import { getOpeningHoursConflict, openingHoursCaption, openingHoursTone } from "@/lib/openingHours";

import { Trash, Files } from "@phosphor-icons/react";
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import { useToast } from "@/components/ui/Toast";
import AppMenu from "@/components/ui/AppMenu";
import JourneyHeader from "@/components/ui/JourneyHeader";
import AddPlaceRow from "@/components/ui/AddPlaceRow";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { type DayWeather, fetchTripWeather, dayStopsAnchor, getWeatherCategory, WeatherIcon, HourlyStrip } from "@/lib/weather";

// ── Constants ──────────────────────────────────────────────────
const COL_PREFIX = "col-";

// A list column's droppable id. Its OWN prefix rather than a suffix under
// COL_PREFIX: every drop is resolved through one function (resolveDropTarget)
// that has to say day-or-list before it says which, and a distinct prefix makes
// that a string test instead of a lookup that happens to miss.
const LIST_PREFIX = "list-";

// Reordering the list columns themselves. Two more prefixes, and the reason is
// the same one that gave LIST_PREFIX its own namespace: the board now has TWO
// kinds of draggable in ONE DndContext, and the only thing standing between
// them is that a drag's kind can be read off its id.
//
//   LIST_DRAG_PREFIX  the id of a list column being dragged by its header grip
//   LIST_SLOT_PREFIX  the droppable a list column can be dropped ON
//
// listCollision() below shows a list drag nothing but list slots, and shows
// every other drag everything BUT list slots. That single filter is what makes
// "a list can never land in a day column" and "a card can never land on the
// reorder rail" true by construction rather than by a branch in each handler.
const LIST_DRAG_PREFIX = "listdrag-";
const LIST_SLOT_PREFIX = "listslot-";

// The Direction A control-row chip — lifted verbatim from DayPicker's trigger
// so "Fold all weeks" / "Unfold all" sit beside "Jump to day" as one family.
const CTRL_CHIP =
  "rounded-full border border-[rgba(26,26,46,0.12)] bg-[rgba(26,26,46,0.025)] px-3 py-1.5 " +
  "text-[12px] font-medium text-activity hover:bg-[rgba(26,26,46,0.05)] transition-colors";

const TYPE_BORDER: Record<CardType, string> = {
  logistics: "border-l-gray-400",
  activity:  "border-l-gray-400",
  food:      "border-l-gray-400",
};



// ── Template definitions ───────────────────────────────────────
interface SkeletonDef {
  type: CardType;
  sub_type: string;
  title: string;
  start_time: string; // HH:mm
  end_time: string | null; // HH:mm or null
}

const TEMPLATES: { key: string; label: string; cards: SkeletonDef[] }[] = [
  {
    key: "full",
    label: "Full day",
    cards: [
      { type: "food",      sub_type: "coffee",        title: "Morning Coffee",     start_time: "08:30", end_time: "09:30" },
      { type: "activity",  sub_type: "self_directed",  title: "Morning Activity",   start_time: "10:00", end_time: "12:00" },
      { type: "food",      sub_type: "restaurant",     title: "Lunch",              start_time: "13:00", end_time: "14:30" },
      { type: "activity",  sub_type: "self_directed",  title: "Afternoon Activity", start_time: "15:00", end_time: "17:30" },
      { type: "food",      sub_type: "cocktail_bar",   title: "Aperitivo",          start_time: "18:30", end_time: "19:30" },
      { type: "food",      sub_type: "restaurant",     title: "Dinner",             start_time: "20:00", end_time: "22:00" },
    ],
  },
  {
    key: "relaxed",
    label: "Relaxed day",
    cards: [
      { type: "food",      sub_type: "coffee",        title: "Morning Coffee", start_time: "09:30", end_time: "10:30" },
      { type: "activity",  sub_type: "self_directed",  title: "Activity",       start_time: "11:00", end_time: "13:00" },
      { type: "food",      sub_type: "restaurant",     title: "Long Lunch",     start_time: "13:30", end_time: "15:30" },
      { type: "activity",  sub_type: "self_directed",  title: "Downtime",       start_time: "16:00", end_time: "18:00" },
      { type: "food",      sub_type: "restaurant",     title: "Dinner",         start_time: "20:00", end_time: "22:00" },
    ],
  },
  {
    key: "beach",
    label: "Beach day",
    cards: [
      { type: "food",      sub_type: "restaurant",    title: "Breakfast",     start_time: "08:00", end_time: "09:00" },
      { type: "activity",  sub_type: "self_directed",  title: "Beach",          start_time: "09:30", end_time: "12:30" },
      { type: "food",      sub_type: "restaurant",    title: "Lunch",          start_time: "13:00", end_time: "14:30" },
      { type: "activity",  sub_type: "self_directed",  title: "Beach",          start_time: "14:30", end_time: "17:30" },
      { type: "food",      sub_type: "cocktail_bar",  title: "Sunset Drinks",  start_time: "18:00", end_time: "19:00" },
      { type: "food",      sub_type: "restaurant",    title: "Dinner",         start_time: "20:00", end_time: "22:00" },
    ],
  },
  {
    key: "transit",
    label: "Transit day",
    cards: [
      { type: "food",      sub_type: "coffee",        title: "Morning Coffee", start_time: "09:00", end_time: "10:00" },
      { type: "activity",  sub_type: "self_directed",  title: "Light Activity", start_time: "10:00", end_time: "12:00" },
      { type: "food",      sub_type: "restaurant",    title: "Lunch",          start_time: "12:30", end_time: "14:00" },
    ],
  },
];

const DAY1_CARDS: SkeletonDef[] = [
  { type: "logistics", sub_type: "flight_arrival", title: "Arrival",      start_time: "10:00", end_time: null  },
  { type: "logistics", sub_type: "hotel",          title: "Check-in",     start_time: "15:00", end_time: null  },
  { type: "food",      sub_type: "restaurant",     title: "Light Dinner", start_time: "20:00", end_time: "21:30" },
];

const LAST_DAY_CARDS: SkeletonDef[] = [
  { type: "food",      sub_type: "coffee",           title: "Morning Coffee", start_time: "08:00", end_time: "09:00" },
  { type: "logistics", sub_type: "flight_departure", title: "Departure",      start_time: "12:00", end_time: null  },
];


function makeCards(
  dayId: string,
  tripId: string,
  skeletons: SkeletonDef[],
  basePosition = 0,
): Card[] {
  return skeletons.map((s, i) => ({
    id:           crypto.randomUUID(),
    day_id:       dayId,
    list_id:      null,
    trip_id:      tripId,
    start_time:   s.start_time + ":00",
    end_time:     s.end_time ? s.end_time + ":00" : null,
    position:     basePosition + i + 1,
    status:       "in_itinerary" as CardStatus,
    source_url:   null,
    details:      { title: s.title },
    ai_generated: false,
    confirmed:    false,
    created_at:   new Date().toISOString(),
    place_id:     null,
    place:        null,
  }));
}

// ── Collision detection ────────────────────────────────────────
// The one place the two kinds of drag are kept apart. Everything downstream —
// handleDragOver, handleDragEnd, resolveDropTarget — can then assume that
// whatever it was handed is a target of the right kind, because dnd-kit was
// never allowed to nominate one of the wrong kind in the first place.
const listCollision: CollisionDetection = (args) => {
  const draggingList = String(args.active.id).startsWith(LIST_DRAG_PREFIX);
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => String(c.id).startsWith(LIST_SLOT_PREFIX) === draggingList,
    ),
  });
};

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Undo ───────────────────────────────────────────────────────
// What a 6-second undo window is holding. Deleting a list keeps the whole
// ListWithCards, not just the row: its cards survive the delete in the database
// (cards.list_id is ON DELETE SET NULL) but they leave the board entirely, so
// restoring the column means restoring the exact set of cards that was on it —
// and their ids are what the re-file writes against.
type UndoEntry =
  | { kind: "card"; card: Card; dayId: string }
  | { kind: "list"; list: ListWithCards; collapsed: boolean };

// ── PlanBoard ──────────────────────────────────────────────────
interface Props {
  trip: Trip;
  initialDays: DayWithCards[];
  /**
   * The traveller's own named columns and their cards, in `position` order.
   * Their own prop rather than synthetic days: nothing downstream (weeks,
   * jump-to-day, weather anchors, template application, day position
   * persistence) should ever see a list as a day.
   */
  initialLists: ListWithCards[];
  /** trips.notes — arrives with the page payload so notes work offline. */
  initialNotes: string | null;
}

export default function PlanBoard({ trip, initialDays, initialLists, initialNotes }: Props) {
  const supabase = createClient();
  const search = useGlobalSearch();
  const { toast } = useToast();
  // Hidden file input behind the Bookings sheet's Upload button.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<DayWithCards[]>(initialDays);

  // A day's title — "Lucca day", "Cinque Terre", "Rest" — so the column says
  // what the day is instead of making you infer it from the cards (Brennan,
  // Sep 2026). Stored on days.theme, which the schema already carried and
  // nothing displayed. Optimistic; reverts if the write is refused. An empty
  // commit clears the title rather than saving a blank.
  const handleRenameDay = useCallback(async (dayId: string, raw: string) => {
    const theme = raw.trim() || null;
    let previous: string | null = null;
    setDays((prev) => prev.map((d) => {
      if (d.id !== dayId) return d;
      previous = d.theme ?? null;
      return { ...d, theme };
    }));
    const { error } = await supabase.from("days").update({ theme }).eq("id", dayId);
    if (error) {
      console.error("[Roam] Saving day title failed:", error.message);
      setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, theme: previous } : d)));
    }
  }, [supabase]);
  const [lists, setLists] = useState<ListWithCards[]>(initialLists);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [addFromSavedDay, setAddFromSavedDay] = useState<DayWithCards | null>(null);
  // Composer day — the board uses the same search-first sheet as the Agenda
  const [composerDay, setComposerDay] = useState<DayWithCards | null>(null);
  // Same composer, aimed at one of the lists instead of a day.
  const [composerList, setComposerList] = useState<ListWithCards | null>(null);
  const [pendingConf,  setPendingConf]  = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [showDocs,     setShowDocs]     = useState(false);

  // The desktop masthead's menu lives in the layout, so its Bookings row asks
  // whichever screen is open to show the sheet (Brennan, Sep 2026: "I thought
  // bookings was supposed to be in the menu like on mobile").
  useEffect(() => {
    const onOpen = () => setShowDocs(true);
    window.addEventListener("roam:open-bookings", onOpen);
    return () => window.removeEventListener("roam:open-bookings", onOpen);
  }, []);
  // Journey notes — the sheet unmounts on close, so the latest text is held
  // here; re-opening it shows what was just written, not the page payload.
  const [showNotes,    setShowNotes]    = useState(false);
  const [notes,        setNotes]        = useState<string | null>(initialNotes);
  // Every list operation fails the same way — say so and get out of the way.
  // Through the app's one toast (ui/Toast.tsx); the board's own pill was the
  // last private copy.
  const showToast = useCallback((msg: string) => { toast({ message: msg }); }, [toast]);
  const handleUndoRef = useRef<() => void>(() => {});
  // Undo window after an instant delete — holds what was removed for re-insert.
  // A card and a list are undone the same way (re-insert the row under its
  // ORIGINAL id so nothing has to be repointed at a new one) and expire the
  // same way, so they share one entry, one timer and one toast rather than
  // growing a second undo mechanism beside the first.
  const [undoDelete, setUndoDelete] = useState<UndoEntry | null>(null);
  const undoDeleteRef = useRef<UndoEntry | null>(null);
  useEffect(() => { undoDeleteRef.current = undoDelete; }, [undoDelete]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startUndoWindow = useCallback((entry: UndoEntry) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoDelete(entry);
    undoTimerRef.current = setTimeout(() => setUndoDelete(null), 6000);
    toast({
      message: entry.kind === "list" ? "List deleted" : "Card deleted",
      undo: () => handleUndoRef.current(),
    });
  }, [toast]);
  // Booking import — file → /api/confirmations/parse → ConfirmationPreviewSheet
  const [importingConf, setImportingConf] = useState(false);
  const handleImportFile = useCallback(async (file: File) => {
    setImportingConf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/confirmations/parse", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file.");
      setPendingConf({ items: json.parsed, fileName: file.name, fileType: file.type });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn't read that file.", duration: 4000 });
    } finally {
      setImportingConf(false);
    }
  }, []);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [bgUrlInput, setBgUrlInput] = useState("");

  // Per-day forecast for the column headers — same source/cache as the Agenda.
  // Days whose stops are in a different city get that city's forecast; the
  // anchor key only changes when a day's stop-centroid crosses a city grid
  // cell, so drag-reorders within a city never refetch.
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DayWeather> | null>(null);
  const dayAnchors = useMemo(
    () =>
      days.flatMap((d) => {
        const a = dayStopsAnchor(d.cards);
        return a ? [{ date: d.date, lat: a.lat, lng: a.lng }] : [];
      }),
    [days]
  );
  const anchorKey = dayAnchors.map((a) => `${a.date}@${a.lat.toFixed(1)},${a.lng.toFixed(1)}`).join("|");
  useEffect(() => {
    if (!trip.destination_lat || !trip.destination_lng) return;
    fetchTripWeather(
      {
        id: trip.id,
        destination_lat: trip.destination_lat,
        destination_lng: trip.destination_lng,
        start_date: trip.start_date,
        end_date: trip.end_date,
      },
      dayAnchors
    )
      .then(setWeatherByDate)
      .catch((err) => { console.error("[Roam] Weather fetch failed:", err); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, trip.destination_lat, trip.destination_lng, trip.start_date, trip.end_date, anchorKey]);
  const [bgPreviewError, setBgPreviewError] = useState(false);
  const [savingBg, setSavingBg] = useState(false);
  const [boardBg, setBoardBg] = useState<BoardBg>(() => {
    // Prefer DB-persisted URL over localStorage
    if (trip.kanban_background_url) {
      return { type: "photo", url: trip.kanban_background_url, thumb: trip.kanban_background_url };
    }
    if (typeof window === "undefined") return { type: "color", value: "#ffffff" };
    try {
      const stored = localStorage.getItem(`roam_board_bg_${trip.id}`);
      if (stored) return JSON.parse(stored) as BoardBg;
    } catch { /* ignore */ }
    return { type: "color", value: "#ffffff" };
  });

  // A board that looks like where you're going. Runs once per journey: the
  // route fills kanban_background_url only when it's empty, so a background
  // picked by hand is never overwritten — and a journey that already has one
  // costs a single cheap read.
  useEffect(() => {
    if (trip.kanban_background_url) return;
    let cancelled = false;
    fetch("/api/trips/fetch-board-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: trip.id }),
    })
      .then((r) => r.json())
      .then((d: { url?: string | null }) => {
        if (cancelled || !d.url) return;
        setBoardBg({ type: "photo", url: d.url, thumb: d.url });
      })
      .catch(() => { /* a plain white board is a fine fallback */ });
    return () => { cancelled = true; };
  }, [trip.id, trip.kanban_background_url]);

  const [isMobile, setIsMobile] = useState(false);
  // Mid-trip, the mobile board opens on today's column, not Day 1.
  // Negative indices are the list slots that precede Day 1 (see below).
  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const today = resolveDefaultDay(initialDays);
    const idx = today ? initialDays.findIndex((d) => d.id === today.id) : 0;
    return idx >= 0 ? idx : 0;
  });
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Desktop board X-scroller — jump-to-day scroll + conditional edge fades.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fades, setFades] = useState({ left: false, right: false });

  // Week fold state — a set of DAY ids, not week ids: a week reads as folded
  // when every member day is in the set. Declared up here because the edge-fade
  // effect below depends on it. Hydrated from localStorage in a mount effect
  // rather than a useState initializer: the server has no storage, so seeding
  // initial state from it would render eleven columns on the server and three
  // cards on the client. One frame of unfolded board beats a mismatch.
  const [foldedDays, setFoldedDays] = useState<Set<string>>(() => new Set());

  // Per-list collapse — a set of list ids, hydrated in a mount effect for the
  // same reason foldedDays is: the server has no localStorage, and seeding from
  // it in a useState initializer would render a 280px column on the server and
  // a 140px rail on the client.
  // An empty list starts folded to its 140px rail. A blank column with
  // "Nothing here yet" is the first thing the eye hit on a new board, and it
  // read as broken; the rail keeps the name and the door (tap to expand)
  // without the dead space. Once it holds a card it opens like any other.
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(
    () => new Set(initialLists.filter((l) => l.cards.length === 0).map((l) => l.id)),
  );
  useEffect(() => {
    // The stored preference (lists you folded by hand) plus every list that is
    // empty right now. An empty list you expanded and left empty folds again
    // next visit, which is the point: the blank column never greets you.
    const stored = readCollapsedLists(trip.id);
    for (const l of initialLists) if (l.cards.length === 0) stored.add(l.id);
    setCollapsedLists(stored);
  }, [trip.id, initialLists]);
  // Pixel width of every leading column, in board order, so the week-bar row
  // and the pinned header row can reserve the same slots the columns row takes.
  const listWidths = useMemo(
    () => lists.map(() => COL_W),
    [lists, collapsedLists],
  );
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Edge fades appear only on real overflow. Recompute on scroll and resize.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || isMobile) return;
    const update = () => {
      const left = el.scrollLeft > 0;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setFades((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // foldedDays: folding changes scrollWidth by thousands of pixels without
    // changing days.length, so without it the fades would desync after a fold.
    // A list collapsing, appearing or being named moves the board for the same
    // reason, which is what the two width arrays below cover.
  }, [isMobile, days.length, foldedDays, listWidths]);

  // Jump the board horizontally to a day's column. Measures the column's real
  // position via rect deltas (independent of any positioned ancestor) rather
  // than hand-summing column width + gap + padding.
  const handleJumpToDay = useCallback((day: Day) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const idx = daysRef.current.findIndex((d) => d.id === day.id);
    const col = scroller.querySelector<HTMLElement>(`[data-col-idx="${idx}"]`);
    if (!col) return;
    const colRect = col.getBoundingClientRect();
    const boxRect = scroller.getBoundingClientRect();
    const PAD = 28; // md:px-7 — leave the column off the flush-left edge
    scroller.scrollTo({
      left: scroller.scrollLeft + (colRect.left - boxRect.left) - PAD,
      behavior: "smooth",
    });
  }, []);

  const daysRef = useRef(days);
  daysRef.current = days;

  // ── Week folding (desktop only) ──────────────────────────────
  useEffect(() => {
    setFoldedDays(readFoldedDays(trip.id));
  }, [trip.id]);

  // Every fold mutation goes through here, so the write can never race the
  // hydrate effect the way a separate persist-on-change effect would.
  const applyFold = useCallback((next: Set<string>) => {
    setFoldedDays(next);
    writeFoldedDays(trip.id, next);
  }, [trip.id]);

  const weeks = useMemo(
    () => (isMobile || !shouldShowWeeks(days) ? [] : groupDaysIntoWeeks(days)),
    [isMobile, days],
  );
  const showWeeks = weeks.length > 0;

  // The one conditional. Each week's folded flag and pixel width are resolved
  // once here; the week-bar row, the pinned header row and the columns row all
  // read this same array, so they cannot disagree about which weeks are folded
  // or how wide their slots are.
  const weekSlots = useMemo(
    () =>
      weeks.map((week) => {
        const folded = week.days.every((d) => foldedDays.has(d.id));
        return { week, folded, width: weekSlotWidth(week.days.length, folded) };
      }),
    [weeks, foldedDays],
  );

  // handleJumpToDay measures [data-col-idx] against the day's index in the flat
  // days array. Grouping columns by week nests that map, so the global index
  // has to be carried in explicitly or the picker would silently scroll to the
  // wrong column.
  const dayIndexById = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.id, i));
    return m;
  }, [days]);

  // Content-space x of a week's left edge — the same rect-delta measurement
  // handleJumpToDay uses, so both agree about where a week sits.
  const weekContentX = useCallback((weekKey: string): number | null => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const el = scroller.querySelector<HTMLElement>(`[data-week-key="${weekKey}"]`);
    if (!el) return null;
    return scroller.scrollLeft + (el.getBoundingClientRect().left - scroller.getBoundingClientRect().left);
  }, []);

  // Folding a seven-day week removes 2,080px of board and inserts a 140px card,
  // shifting everything to its right ~1,940px left. Hold the folded week's own
  // left edge where it was: content to its left never moves, so in the common
  // case that means restoring the scroll the browser silently clamped, and only
  // a week starting off-screen to the left (reachable via Fold all) needs a
  // real correction. Measure after two frames — the first fires before the new
  // layout exists.
  const anchorWeek = useCallback((weekKey: string, mutate: () => void) => {
    const scroller = scrollerRef.current;
    const beforeX = weekContentX(weekKey);
    const beforeScroll = scroller?.scrollLeft ?? 0;
    mutate();
    if (!scroller || beforeX === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const afterX = weekContentX(weekKey);
        let next = beforeScroll;
        if (afterX !== null && beforeX < beforeScroll) next = beforeScroll + (afterX - beforeX);
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        scroller.scrollLeft = Math.min(Math.max(0, next), max);
      });
    });
  }, [weekContentX]);

  const scrollBoardToStart = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
      });
    });
  }, []);

  // Swallows the SECOND click of a double-click on a week bar — nothing more.
  // The − sits at the bar's right edge, and after the fold that pixel belongs
  // to the NEXT week's bar, so a double-click aimed at one week would fold two.
  // Gated on the pointer not having moved (4px), so a deliberate move-and-click
  // on another bar is never swallowed. This is not a general cooldown.
  const lastFoldRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleFoldWeek = useCallback((e: React.MouseEvent, week: PlanWeek<DayWithCards>) => {
    const prev = lastFoldRef.current;
    if (
      prev &&
      e.timeStamp - prev.t < 400 &&
      Math.abs(e.clientX - prev.x) <= 4 &&
      Math.abs(e.clientY - prev.y) <= 4
    ) return;
    lastFoldRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };

    anchorWeek(week.key, () => {
      const next = new Set(foldedDays);
      week.days.forEach((d) => next.add(d.id));
      applyFold(next);
    });
  }, [anchorWeek, applyFold, foldedDays]);

  // Unfolding grows the board, so nothing is pulled out from under the cursor
  // and a reflex second click merely re-folds the same week — reversible, and
  // not worth suppressing.
  const handleUnfoldWeek = useCallback((week: PlanWeek<DayWithCards>) => {
    anchorWeek(week.key, () => {
      const next = new Set(foldedDays);
      week.days.forEach((d) => next.delete(d.id));
      applyFold(next);
    });
  }, [anchorWeek, applyFold, foldedDays]);

  // One control, labelled for what it will do next. Collapsing and expanding
  // both change the board's width wholesale, leaving no meaningful anchor, so
  // both land at the start.
  const allCollapsed = weekSlots.length > 0 && weekSlots.every((s) => s.folded);

  const handleToggleAll = useCallback(() => {
    if (allCollapsed) {
      applyFold(new Set());
    } else {
      const next = new Set(foldedDays);
      weeks.forEach((w) => w.days.forEach((d) => next.add(d.id)));
      applyFold(next);
    }
    scrollBoardToStart();
  }, [allCollapsed, applyFold, foldedDays, weeks, scrollBoardToStart]);

  // Jump to day sees through folds: the picker lists every day, so a pick can
  // land inside a folded week. Unfold it, let React commit and the browser lay
  // out, then hand off to the existing rect-delta helper — measuring before
  // layout is real would scroll to a column that does not exist yet.
  const handlePickDay = useCallback((day: Day) => {
    if (!foldedDays.has(day.id)) {
      handleJumpToDay(day);
      return;
    }
    const week = weeks.find((w) => w.days.some((d) => d.id === day.id));
    const next = new Set(foldedDays);
    week?.days.forEach((d) => next.delete(d.id));
    applyFold(next);
    requestAnimationFrame(() => requestAnimationFrame(() => handleJumpToDay(day)));
  }, [foldedDays, weeks, applyFold, handleJumpToDay]);

  const preDragSnapshot = useRef<DayWithCards[] | null>(null);
  const crossColumnMoved = useRef(false);

  // A list column being dragged by its header grip, and the list its slot is
  // currently over. Separate from `activeId` (a card) on purpose: the two never
  // coexist, and keeping them apart means no handler has to ask "which kind is
  // this?" of a single variable.
  // Write-only. The drag handlers below are shared with card dragging and
  // still clear these on every start/end; nothing reads them now that lists are
  // off the board, and a stale reader is worse than an unread write.
  const [, setActiveListId] = useState<string | null>(null);
  const [, setListOverId] = useState<string | null>(null);

  const sensors = useSensors(
    // Mouse: immediate drag after 8px movement — no delay on desktop
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Touch: require 250ms long-press before drag activates; 8px tolerance
    // so a normal tap or brief swipe never accidentally starts a drag
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates as KeyboardCoordinateGetter,
    })
  );

  // Lists are searched too, so the DragOverlay renders a list card while it is
  // being dragged onto a day.
  const findCard = useCallback(
    (id: string) =>
      daysRef.current.flatMap((d) => d.cards).find((c) => c.id === id) ??
      listsRef.current.flatMap((l) => l.cards).find((c) => c.id === id),
    []
  );

  // ── Persistence ──────────────────────────────────────────────
  const persistChanges = useCallback(
    async (before: DayWithCards[], after: DayWithCards[]) => {
      const beforeMap = new Map(
        before.flatMap((d) => d.cards).map((c) => [c.id, c])
      );
      const updates = after.flatMap((day) =>
        day.cards.flatMap((card, i) => {
          const orig = beforeMap.get(card.id);
          if (!orig) return [];
          const newPos = i + 1;
          if (orig.day_id === day.id && orig.position === newPos) return [];
          return [{ id: card.id, day_id: day.id, position: newPos }];
        })
      );
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("cards").update({ day_id: u.day_id, position: u.position }).eq("id", u.id)
        )
      );
      // Same reason as persistListOrder: resolve-don't-throw means the
      // try/catch in handleDragEnd and handleMobileDragEnd never fired, so a
      // failed cross-column move looked like it worked until the next load.
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    },
    [supabase]
  );

  // ── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    // A list drag touches no card and no day, so it takes none of the card
    // drag's machinery — no `days` snapshot to roll back, nothing to preview.
    if (id.startsWith(LIST_DRAG_PREFIX)) {
      setActiveListId(id.slice(LIST_DRAG_PREFIX.length));
      setListOverId(null);
      return;
    }
    setActiveId(id);
    preDragSnapshot.current = daysRef.current;
    crossColumnMoved.current = false;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;

    // Lists: the only thing to track live is which slot the column would land
    // on, so the board can draw the insertion edge. listCollision guarantees
    // `over` is a list slot or nothing.
    if (String(active.id).startsWith(LIST_DRAG_PREFIX)) {
      const id = String(over?.id ?? "");
      setListOverId(id.startsWith(LIST_SLOT_PREFIX) ? id.slice(LIST_SLOT_PREFIX.length) : null);
      return;
    }

    if (!over) return;

    const activeId = active.id as string;
    const overId   = over.id as string;
    const cur = daysRef.current;

    const srcIdx = cur.findIndex((d) => d.cards.some((c) => c.id === activeId));
    if (srcIdx < 0) return;

    const dstIdx = overId.startsWith(COL_PREFIX)
      ? cur.findIndex((d) => d.id === overId.slice(COL_PREFIX.length))
      : cur.findIndex((d) => d.cards.some((c) => c.id === overId));

    if (dstIdx < 0 || dstIdx === srcIdx) return;

    crossColumnMoved.current = true;

    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, cards: [...d.cards] }));
      const moving = next[srcIdx].cards.find((c) => c.id === activeId)!;
      next[srcIdx].cards = next[srcIdx].cards.filter((c) => c.id !== activeId);
      const overIdx = next[dstIdx].cards.findIndex((c) => c.id === overId);
      const at = overIdx >= 0 ? overIdx : next[dstIdx].cards.length;
      next[dstIdx].cards.splice(at, 0, { ...moving, day_id: next[dstIdx].id });
      return next;
    });
  }, []);

  // ── List ⇄ day ───────────────────────────────────────────────
  // Both directions MOVE the same row. Elsewhere in Roam, scheduling a saved
  // place copies it (LinkPlaceSheet's create mode writes a new card and leaves
  // the interested one alone) because that pile is the map's saved pins and
  // must survive being scheduled. A list is not that pile — it holds cards the
  // traveller deliberately put there, one at a time — so a copy would leave a
  // duplicate behind on a column whose whole point is that its contents are
  // chosen. Dragging out empties the slot, which is what Trello does.

  /** Rewrite one list's cards, keeping every other list untouched. */
  const setListCards = useCallback(
    (listId: string, fn: (cards: Card[]) => Card[]) =>
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, cards: fn(l.cards) } : l))),
    [],
  );

  // Contiguous 1-based positions within one list, written only for the cards
  // whose number actually changed. A dayless card used to be written at
  // position 0 regardless, so its column had no order to persist — that is the
  // gap this closes.
  const persistListOrder = useCallback(
    async (cards: Card[]) => {
      const results = await Promise.all(
        cards.flatMap((c, i) =>
          c.position === i + 1
            ? []
            : [supabase.from("cards").update({ position: i + 1 }).eq("id", c.id)],
        ),
      );
      // supabase-js RESOLVES with { data, error } instead of throwing, so a
      // caller's try/catch is dead code unless the failure is rethrown here.
      // Without this a refused reorder was silently lost until a refresh.
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    },
    [supabase],
  );

  // List → day. Same row, now on a day: status 'in_itinerary', the target day's
  // id, a contiguous 1-based position (the live max for that day, read at write
  // time via the shared helper), and no list.
  const scheduleListCardOnDay = useCallback(
    async (card: Card, fromList: ListWithCards, day: DayWithCards) => {
      const position = await nextPositionForDay(supabase, day.id);
      const scheduled: Card = {
        ...card,
        day_id:  day.id,
        list_id: null,
        status:  "in_itinerary",
        position,
      };

      setListCards(fromList.id, (cards) => cards.filter((c) => c.id !== card.id));
      setDays((prev) =>
        prev.map((d) => (d.id === day.id ? { ...d, cards: [...d.cards, scheduled] } : d)),
      );
      setSelectedCard((prev) => (prev?.id === card.id ? scheduled : prev));

      const { error } = await supabase
        .from("cards")
        .update({ day_id: day.id, list_id: null, status: "in_itinerary", position })
        .eq("id", card.id);

      if (error) {
        setListCards(fromList.id, (cards) => [...cards, card]);
        setDays((prev) =>
          prev.map((d) => (d.id === day.id ? { ...d, cards: d.cards.filter((c) => c.id !== card.id) } : d)),
        );
        showToast("Couldn't add that to the day.");
      }
    },
    [supabase, setListCards, showToast],
  );

  // Day → list. The exact inverse: day_id null, status 'interested', the
  // target list, and a real position at the end of it. Nothing is deleted and
  // nothing depends on a sibling interested card existing — this is the
  // traveller moving THIS card, so this card is what has to survive.
  const unscheduleCardToList = useCallback(
    async (cardId: string, list: ListWithCards) => {
      const snapshot = daysRef.current;
      const fromDay  = snapshot.find((d) => d.cards.some((c) => c.id === cardId));
      const card     = fromDay?.cards.find((c) => c.id === cardId);
      if (!card || !fromDay) return;

      const position = await nextPositionForList(supabase, list.id);
      const listed: Card = {
        ...card,
        day_id:  null as unknown as string, // nullable column, non-null on Card
        list_id: list.id,
        status:  "interested",
        position,
      };

      setDays((prev) =>
        prev.map((d) => (d.id === fromDay.id ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d)),
      );
      setListCards(list.id, (cards) => [...cards, listed]);
      setSelectedCard((prev) => (prev?.id === cardId ? listed : prev));

      const { error } = await supabase
        .from("cards")
        .update({ day_id: null, list_id: list.id, status: "interested", position })
        .eq("id", cardId);

      if (error) {
        setDays(snapshot);
        setListCards(list.id, (cards) => cards.filter((c) => c.id !== cardId));
        showToast("Couldn't move that card — please try again.");
      }
    },
    [supabase, setListCards, showToast],
  );

  // List → list. Only membership changes; the card keeps its day (none), its
  // status and its content, and lands at the end of its new column.
  const moveCardBetweenLists = useCallback(
    async (card: Card, fromList: ListWithCards, toList: ListWithCards) => {
      const position = await nextPositionForList(supabase, toList.id);
      const moved: Card = { ...card, list_id: toList.id, position };

      setLists((prev) =>
        prev.map((l) => {
          if (l.id === fromList.id) return { ...l, cards: l.cards.filter((c) => c.id !== card.id) };
          if (l.id === toList.id)   return { ...l, cards: [...l.cards, moved] };
          return l;
        }),
      );
      setSelectedCard((prev) => (prev?.id === card.id ? moved : prev));

      const { error } = await supabase
        .from("cards")
        .update({ list_id: toList.id, position })
        .eq("id", card.id);

      if (error) {
        setLists((prev) =>
          prev.map((l) => {
            if (l.id === toList.id)   return { ...l, cards: l.cards.filter((c) => c.id !== card.id) };
            if (l.id === fromList.id) return { ...l, cards: [...l.cards, card] };
            return l;
          }),
        );
        showToast("Couldn't move that card — please try again.");
      }
    },
    [supabase, showToast],
  );

  // Reorder within one list, and persist it. A list is an ordered pile — "the
  // two we're actually deciding between, then the rest" — so the order the
  // traveller sets has to survive a refresh.
  const reorderWithinList = useCallback(
    async (list: ListWithCards, activeCardId: string, overCardId: string | null) => {
      if (!overCardId || activeCardId === overCardId) return;
      const oldIdx = list.cards.findIndex((c) => c.id === activeCardId);
      const newIdx = list.cards.findIndex((c) => c.id === overCardId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

      const reordered = arrayMove(list.cards, oldIdx, newIdx).map((c, i) => ({ ...c, position: i + 1 }));
      setListCards(list.id, () => reordered);

      try {
        await persistListOrder(reordered);
      } catch {
        setListCards(list.id, () => list.cards);
        showToast("Couldn't save that order.");
      }
    },
    [setListCards, persistListOrder, showToast],
  );

  // "+ Add a card" on a list — the same search-first sheet the day columns use,
  // so a card here can be a real Google place (pin, photo, hours), not a bare
  // title. Only the destination differs: no day, and a list.
  const handleListCardCreated = useCallback((card: Card) => {
    if (!card.list_id) return;
    setListCards(card.list_id, (cards) => [...cards, card]);
    setComposerList(null);
  }, [setListCards]);

  // ── List CRUD ────────────────────────────────────────────────
  // A list is created only when it has a name: an abandoned "+ Add a list"
  // leaves no row, so the board never grows an untitled column.


  // ── List order ───────────────────────────────────────────────
  // A list's position used to be set once, at creation, and never again, so
  // putting "Prep" before "Research" meant deleting and remaking it. Both ways
  // of reordering — the header drag and the menu's Move left/right — land here.
  //
  // Renumber the whole array 1..n and write ONLY the rows whose number actually
  // changed, mirroring persistListOrder's approach for cards inside a list.
  // Optimistic, with the pre-move array kept for rollback.
  const applyListOrder = useCallback(
    async (next: ListWithCards[], prev: ListWithCards[]) => {
      const renumbered = next.map((l, i) => ({ ...l, position: i + 1 }));
      setLists(renumbered);

      const before = new Map(prev.map((l) => [l.id, l.position]));
      const writes = renumbered.flatMap((l) =>
        before.get(l.id) === l.position
          ? []
          : [supabase.from("trip_lists").update({ position: l.position }).eq("id", l.id)],
      );
      if (writes.length === 0) return;

      // supabase-js resolves rather than throws, so the failure has to be read
      // off each result — a try/catch here would never fire.
      const results = await Promise.all(writes);
      if (results.some((r) => r.error)) {
        setLists(prev);
        showToast("Couldn't save that order.");
      }
    },
    [supabase, showToast],
  );

  /** Move a list to another index among the lists. Out-of-range is a no-op. */
  const moveListToIndex = useCallback(
    async (listId: string, toIndex: number) => {
      const cur = listsRef.current;
      const from = cur.findIndex((l) => l.id === listId);
      if (from < 0 || toIndex < 0 || toIndex >= cur.length || toIndex === from) return;
      await applyListOrder(arrayMove(cur, from, toIndex), cur);
    },
    [applyListOrder],
  );

  // The menu's Move left / Move right. Present on desktop for keyboard and
  // screen-reader reach, and the ONLY way to reorder on a phone, where the
  // board shows one column at a time and there is nothing to drag across to.

  // Deleting a list deletes the LIST. `cards.list_id` is ON DELETE SET NULL, so
  // its cards stay in the journey as saved places — the confirm copy says so,
  // because a column named "Research" holding a week of work must not read as a
  // one-click way to lose it. The name, the grouping and the order are the parts
  // that genuinely go, which is what the undo window buys back.

  // ── Drop-target resolution ───────────────────────────────────
  // Every drop asks the same question — day, list, or nothing — and asks it
  // once, here. dnd-kit hands back either a column's droppable id or the id of
  // the card being hovered, so both shapes resolve through this one function
  // and no branch downstream has to re-derive what it landed on.
  type DropTarget =
    | { kind: "day"; day: DayWithCards }
    | { kind: "list"; list: ListWithCards; overCardId: string | null }
    | null;

  const resolveDropTarget = useCallback((overId: string): DropTarget => {
    if (overId.startsWith(LIST_PREFIX)) {
      const list = listsRef.current.find((l) => l.id === overId.slice(LIST_PREFIX.length));
      return list ? { kind: "list", list, overCardId: null } : null;
    }
    if (overId.startsWith(COL_PREFIX)) {
      const day = daysRef.current.find((d) => d.id === overId.slice(COL_PREFIX.length));
      return day ? { kind: "day", day } : null;
    }
    const inList = listsRef.current.find((l) => l.cards.some((c) => c.id === overId));
    if (inList) return { kind: "list", list: inList, overCardId: overId };
    const inDay = daysRef.current.find((d) => d.cards.some((c) => c.id === overId));
    return inDay ? { kind: "day", day: inDay } : null;
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    // ── A list column ──
    // Dropping list A on list B's slot puts A at B's index — the same
    // arrayMove semantics a sortable would give, without a second
    // SortableContext whose transforms would only animate one of the two rows
    // (header, column) a list is rendered in.
    if (String(active.id).startsWith(LIST_DRAG_PREFIX)) {
      const draggedId = String(active.id).slice(LIST_DRAG_PREFIX.length);
      const overId = String(over?.id ?? "");
      setActiveListId(null);
      setListOverId(null);
      if (!overId.startsWith(LIST_SLOT_PREFIX)) return;
      const toIndex = listsRef.current.findIndex((l) => l.id === overId.slice(LIST_SLOT_PREFIX.length));
      await moveListToIndex(draggedId, toIndex);
      return;
    }

    setActiveId(null);

    const snapshot = preDragSnapshot.current;
    preDragSnapshot.current = null;
    const wasCross = crossColumnMoved.current;
    crossColumnMoved.current = false;

    if (!over || !snapshot) {
      if (snapshot) setDays(snapshot);
      return;
    }

    const activeId = active.id as string;
    const overId   = over.id as string;
    let finalDays  = daysRef.current;

    const target   = resolveDropTarget(overId);
    const fromList = listsRef.current.find((l) => l.cards.some((c) => c.id === activeId));

    // ── A card that lives on a list ──
    // handleDragOver never previews these moves (a list card is in no day, so
    // its source lookup misses and it returns early), which means `days` is
    // still exactly the snapshot here and there is nothing to persist.
    if (fromList) {
      const card = fromList.cards.find((c) => c.id === activeId)!;
      if (!target) return;
      if (target.kind === "day") {
        await scheduleListCardOnDay(card, fromList, target.day);         // schedule
      } else if (target.list.id === fromList.id) {
        await reorderWithinList(fromList, activeId, target.overCardId);  // reorder
      } else {
        await moveCardBetweenLists(card, fromList, target.list);         // re-file
      }
      return;
    }

    // ── Day → list: unschedule ──
    // Same story in reverse: dropping on a list leaves `days` untouched during
    // the drag, so unscheduleCardToList owns the whole state change.
    if (target?.kind === "list") {
      await unscheduleCardToList(activeId, target.list);
      return;
    }

    if (!wasCross && !overId.startsWith(COL_PREFIX) && activeId !== overId) {
      const dayIdx = finalDays.findIndex((d) => d.cards.some((c) => c.id === activeId));
      if (dayIdx >= 0 && finalDays[dayIdx].cards.some((c) => c.id === overId)) {
        const oldIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === activeId);
        const newIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === overId);
        if (oldIdx !== newIdx) {
          finalDays = finalDays.map((d, i) =>
            i === dayIdx ? { ...d, cards: arrayMove(d.cards, oldIdx, newIdx) } : d
          );
          setDays(finalDays);
        }
      }
    }

    try {
      await persistChanges(snapshot, finalDays);
    } catch {
      // A card springing back to where it was, with no word about why, reads
      // as the drag having missed rather than the write having failed.
      setDays(snapshot);
      showToast("Couldn't save that move.");
    }
  }, [
    persistChanges, resolveDropTarget, scheduleListCardOnDay,
    unscheduleCardToList, moveCardBetweenLists, reorderWithinList,
    moveListToIndex, showToast,
  ]);

  // Escape mid-drag fires onDragCancel, never onDragEnd, so without this the
  // board kept an overlay (and, for a card, a half-applied cross-column
  // preview) after a cancelled drag. Both contexts use it.
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveListId(null);
    setListOverId(null);
    const snapshot = preDragSnapshot.current;
    preDragSnapshot.current = null;
    crossColumnMoved.current = false;
    if (snapshot) setDays(snapshot);
  }, []);

  // ── Mobile drag (within one column only) ──────────────────────
  // The phone shows one column at a time, so there is nowhere to drag ACROSS
  // to — but a list is an ordered pile there too, so a reorder inside the
  // visible list has to work and has to persist.
  const handleMobileDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    // No grip is rendered on a phone (the header cells are desktop-only) and
    // the slot droppables are disabled there, so a list drag cannot start —
    // this only says so out loud.
    if (String(active.id).startsWith(LIST_DRAG_PREFIX)) return;
    setActiveId(null);
    const snapshot = preDragSnapshot.current;
    preDragSnapshot.current = null;
    if (!over || !snapshot) {
      if (snapshot) setDays(snapshot);
      return;
    }
    const activeCardId = active.id as string;
    const overId = over.id as string;
    let finalDays = daysRef.current;

    const fromList = listsRef.current.find((l) => l.cards.some((c) => c.id === activeCardId));
    if (fromList) {
      const target = resolveDropTarget(overId);
      if (target?.kind === "list" && target.list.id === fromList.id) {
        await reorderWithinList(fromList, activeCardId, target.overCardId);
      }
      return;
    }

    if (activeCardId !== overId && !overId.startsWith(COL_PREFIX)) {
      const dayIdx = finalDays.findIndex((d) => d.cards.some((c) => c.id === activeCardId));
      if (dayIdx >= 0 && finalDays[dayIdx].cards.some((c) => c.id === overId)) {
        const oldIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === activeCardId);
        const newIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === overId);
        if (oldIdx !== newIdx) {
          finalDays = finalDays.map((d, i) =>
            i === dayIdx ? { ...d, cards: arrayMove(d.cards, oldIdx, newIdx) } : d
          );
          setDays(finalDays);
        }
      }
    }
    try {
      await persistChanges(snapshot, finalDays);
    } catch {
      setDays(snapshot);
      showToast("Couldn't save that move.");
    }
  }, [persistChanges, resolveDropTarget, reorderWithinList, showToast]);

  // ── Swipe navigation ───────────────────────────────────────────
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.6) {
      // Swiping right off Day 1 walks back through the list slots (see below).
      if (dx < 0) setMobileDayIdx((prev) => Math.min(prev + 1, daysRef.current.length - 1));
      else setMobileDayIdx((prev) => Math.max(prev - 1, -(listsRef.current.length + 1)));
    }
  }, []);

  // ── Card edits ────────────────────────────────────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
    // A list card can be edited, or given a day, from the card sheet — the
    // sheet rewrites day_id/status on the same row, the same move a drag makes,
    // so mirror it here. The sheet knows nothing about lists, so clearing
    // `list_id` is ours to do: leaving it set would put the card on a list and
    // on a day at once, and the page's list query would then have to guess.
    const fromList = listsRef.current.find((l) => l.cards.some((c) => c.id === updated.id));
    if (fromList) {
      if (updated.day_id) {
        const scheduled: Card = { ...updated, list_id: null };
        setListCards(fromList.id, (cards) => cards.filter((c) => c.id !== updated.id));
        setDays((prev) =>
          prev.map((d) => (d.id === updated.day_id ? { ...d, cards: [...d.cards, scheduled] } : d)),
        );
        setSelectedCard((prev) => (prev?.id === updated.id ? scheduled : prev));
        supabase.from("cards").update({ list_id: null }).eq("id", updated.id).then(({ error }) => {
          if (error) showToast("That card is on a day, but still shows on its list.");
        });
        return;
      }
      setListCards(fromList.id, (cards) =>
        cards.map((c) => (c.id === updated.id ? { ...updated, list_id: fromList.id } : c)),
      );
      setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
      return;
    }
    setDays((prev) => {
      const srcDay = prev.find((d) => d.cards.some((c) => c.id === updated.id));
      if (srcDay && updated.day_id && srcDay.id !== updated.day_id) {
        return prev.map((d) => {
          if (d.id === srcDay.id) return { ...d, cards: d.cards.filter((c) => c.id !== updated.id) };
          if (d.id === updated.day_id) return { ...d, cards: [...d.cards, updated] };
          return d;
        });
      }
      return prev.map((d) => ({ ...d, cards: d.cards.map((c) => (c.id === updated.id ? updated : c)) }));
    });
    setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
  }, [setListCards, supabase, showToast]);

  const handleDelete = useCallback(async (cardId: string) => {
    const snapshot = daysRef.current;
    const listsSnapshot = listsRef.current;
    const fromDay = snapshot.find((d) => d.cards.some((c) => c.id === cardId));
    const deleted = fromDay?.cards.find((c) => c.id === cardId) ?? null;
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) })));
    // A list card deleted from the card sheet is the saved place itself going
    // away — drop it here too, or the map pin and the column would disagree.
    setLists((prev) =>
      prev.some((l) => l.cards.some((c) => c.id === cardId))
        ? prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) }))
        : prev,
    );
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    const { error } = await queuedDelete("cards", { id: cardId });
    if (error) {
      setDays(snapshot);
      setLists(listsSnapshot);
      toast({ message: "Couldn't delete — please try again." });
      return;
    }
    // Deletes are instant (no confirm dialog), so offer a window to undo
    if (deleted && fromDay) {
      startUndoWindow({ kind: "card", card: deleted, dayId: fromDay.id });
    }
  }, [supabase, startUndoWindow]);

  const handleUndoDelete = useCallback(async () => {
    const u = undoDeleteRef.current;
    if (!u) return;
    setUndoDelete(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // ── A list ──
    // Re-insert under the ORIGINAL id, so the cards can simply be pointed back
    // at it — nothing else on the board (collapse state, composer target,
    // mobile slot index) has to be rewritten to a new id.
    if (u.kind === "list") {
      const { list } = u;
      const cardIds = list.cards.map((c) => c.id);
      const { error } = await queuedInsert("trip_lists", {
        id: list.id, trip_id: list.trip_id, title: list.title, position: list.position,
      });
      if (error) {
        showToast("Couldn't restore that list.");
        return;
      }
      // ON DELETE SET NULL emptied list_id on exactly these rows; put it back on
      // exactly these rows. A card deleted in the meantime just isn't matched.
      let cardsRestored = true;
      if (cardIds.length) {
        const { error: cardErr } = await supabase
          .from("cards").update({ list_id: list.id }).in("id", cardIds);
        if (cardErr) {
          cardsRestored = false;
          showToast("The list is back, but its cards aren't on it.");
        }
      }
      const restored = cardsRestored ? list : { ...list, cards: [] };
      setLists((prev) => [...prev, restored].sort((a, b) => a.position - b.position));
      if (u.collapsed) {
        setCollapsedLists((prev) => {
          const next = new Set(prev).add(list.id);
          writeCollapsedLists(trip.id, next);
          return next;
        });
      }
      return;
    }

    const { card } = u;
    // Re-insert the row with its original id so attachments/links keep working
    const { error } = await queuedInsert("cards", {
      id: card.id, day_id: card.day_id, list_id: card.list_id, trip_id: card.trip_id,
      start_time: card.start_time, end_time: card.end_time,
      position: card.position, status: card.status, source_url: card.source_url,
      details: card.details, ai_generated: card.ai_generated,
      confirmed: card.confirmed, place_id: card.place_id,
    });
    if (error) {
      toast({ message: "Couldn't restore the card." });
      return;
    }
    setDays((prev) =>
      prev.map((d) =>
        d.id === u.dayId
          ? { ...d, cards: [...d.cards, card].sort((a, b) => a.position - b.position) }
          : d
      )
    );
  }, [supabase, showToast, trip.id]);
  handleUndoRef.current = () => { void handleUndoDelete(); };

  // "Copy to another day" writes a brand-new card on the target day; the sheet
  // hands it back so the board shows it without a refetch. The source card is
  // untouched, so nothing else in state changes.
  const handleCardCopied = useCallback((created: Card) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === created.day_id
          ? { ...d, cards: [...d.cards, created].sort((a, b) => a.position - b.position) }
          : d
      )
    );
  }, []);

  // ── Card creation (board view) ──────────────────────────────
  // The board opens the same CreateCardSheet the Agenda uses, so a card
  // added here can be a searched Google place (pin, photo, hours) rather
  // than a bare title. The sheet owns the insert; we splice the result in.
  const handleComposerCreated = useCallback((card: Card) => {
    setDays((prev) =>
      prev.map((d) => (d.id === card.day_id ? { ...d, cards: [...d.cards, card] } : d))
    );
    setComposerDay(null);
  }, []);

  // ── Door 1: cards placed from the "Add from saved" picker ────
  // The picker writes via the shared helper and hands back the new card(s);
  // we just splice them into the right day. The interested card is untouched.
  const handleSavedAdded = useCallback((added: Card[]) => {
    setDays((prev) => prev.map((d) => {
      const mine = added.filter((c) => c.day_id === d.id);
      return mine.length ? { ...d, cards: [...d.cards, ...mine] } : d;
    }));
  }, []);

  // place_ids scheduled anywhere on the trip — derived from loaded days, no query.
  const scheduledPlaceIds = new Set(
    days.flatMap((d) => d.cards)
      .filter((c) => c.status === "in_itinerary" && c.place_id)
      .map((c) => c.place_id as string),
  );

  // ── Apply day template to all days ───────────────────────────
  const handleApplyTemplate = useCallback(async (templateKey: string) => {
    const template = TEMPLATES.find((t) => t.key === templateKey);
    if (!template || !days.length) return;

    const allNewCards: Card[] = [];

    days.forEach((day, idx) => {
      const isFirst = idx === 0;
      const isLast  = idx === days.length - 1 && days.length > 1;
      let skeletons: SkeletonDef[];
      if (isFirst) skeletons = DAY1_CARDS;
      else if (isLast) skeletons = LAST_DAY_CARDS;
      else skeletons = template.cards;
      // Continue numbering after the day's existing cards — starting at 1
      // again collides with what's already there
      const base = day.cards.reduce((m, c) => Math.max(m, c.position), 0);
      allNewCards.push(...makeCards(day.id, trip.id, skeletons, base));
    });

    // Optimistic update — APPEND, matching what the DB write below does.
    // Replacing here made every existing card vanish from view until refresh.
    const snapshot = daysRef.current;
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        cards: [...day.cards, ...allNewCards.filter((c) => c.day_id === day.id)],
      }))
    );

    const rows = allNewCards.map((c) => ({
      id:           c.id,
      day_id:       c.day_id,
      trip_id:      c.trip_id,
      start_time:   c.start_time,
      end_time:     c.end_time,
      position:     c.position,
      status:       c.status,
      source_url:   null,
      details:      c.details,
      ai_generated: false,
      place_id:     null,
    }));
    const { error } = await queuedInsert("cards", rows as unknown as Record<string, unknown>[]);
    if (error) {
      console.error("[PlanBoard.handleApplyTemplate] card insert failed:", error);
      setDays(snapshot);
    }
  }, [days, trip.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps


  const activeCard  = activeId ? findCard(activeId) : null;
  const allEmpty    = days.every((d) => d.cards.length === 0);

  // Home is where you sleep, not where you spend the most cards.
  //
  // Counting cards made Tuscany's home FLORENCE — ten cards there against nine
  // in Lucca — so Lucca printed its name and Florence, a day trip, said
  // nothing. Backwards: the villa is outside Lucca. The hotel knows the answer
  // and no tally does, so ask it first; only when a journey has no hotel card
  // does the count stand in, and then by DAYS rather than cards, because a
  // single packed day out should not outvote a week of coming back to the same
  // place.
  const homeTown = useMemo(() => {
    const dayCounts = new Map<string, Set<string>>();
    let hotel: string | null = null;
    for (const d of days) {
      for (const c of d.cards) {
        const t = placeTown(c.place?.address);
        if (!t) continue;
        if (!hotel && c.place?.sub_type === "hotel") hotel = t;
        if (!dayCounts.has(t)) dayCounts.set(t, new Set());
        dayCounts.get(t)!.add(d.id);
      }
    }
    if (hotel) return hotel;
    let home: string | null = null;
    let best = 0;
    dayCounts.forEach((dayIds, town) => { if (dayIds.size > best) { best = dayIds.size; home = town; } });
    // One day in a town does not make it home; it makes it a day out.
    return best >= 2 ? home : null;
  }, [days]);

  // ── Mobile: the lists are the slots before Day 1 ─────────────
  // The phone shows one column at a time, so the lists join the same swipe
  // sequence rather than getting a second navigation idiom — and they sit
  // before Day 1, the position they hold on desktop. Negative indices rather
  // than a re-based 0..n scheme so every existing use of mobileDayIdx (the day
  // picker, the dots, the arrows) still means "index into days".
  //
  //   idx:   −(n+1) … −2      −1            0, 1, 2 …
  //   slot:  lists[0…n−1]     + Add a list  days
  //
  // The "+ Add a list" pane is in the sequence whether or not any list exists,
  // because on a phone it is the ONLY way to make the first one — hiding it
  // would make lists unreachable exactly when you want to start using them. The
  // board still OPENS on today's column, so all of this costs nothing until you
  // swipe right past Day 1 or tap one of the leading dots.
  // Day 1 is the left end of the phone's swipe. This used to be −(n+1) so the
  // lists and their composer could sit before Day 1; with lists gone from the
  // board, −1 was still reachable and still offered to make one (Brennan caught
  // this, 2026-09-06). Everything below that reads a negative index now
  // resolves to nothing rather than needing to be cut out.
  const mobileMinIdx = 0;
  const safeMobileIdx = Math.max(
    mobileMinIdx,
    Math.min(mobileDayIdx, Math.max(0, days.length - 1)),
  );
  // 0…n−1 is a list; n is the add-a-list pane; below zero is a day.
  const mobileSlot = safeMobileIdx + lists.length + 1;
  const currentMobileList = safeMobileIdx < 0 ? lists[mobileSlot] : undefined;
  const currentMobileDay = safeMobileIdx < 0 ? undefined : days[safeMobileIdx];

  const boardBgStyle: React.CSSProperties =
    boardBg.type === "photo"
      ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url(${boardBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : { backgroundColor: boardBg.value };

  const isPhotoBg = boardBg.type === "photo";

  // One column renderer for both the flat and the week-grouped paths, so the
  // two can never drift in what a column is handed. dayIndex stays the day's
  // index in the flat days array — handleJumpToDay measures by it.
  const renderColumn = (day: DayWithCards) => (
    <DayColumn
      key={day.id}
      day={day}
      cards={day.cards}
      dayIndex={dayIndexById.get(day.id) ?? 0}
      isPhotoBg={isPhotoBg}
      onCardTap={(card) => setSelectedCard(card)}
      onDelete={handleDelete}
      onOpenComposer={() => setComposerDay(day)}
      onAddFromSaved={() => setAddFromSavedDay(day)}
    />
  );



  const handleBgSave = async (url: string) => {
    const newBg: BoardBg = url
      ? { type: "photo", url, thumb: url }
      : { type: "color", value: "#ffffff" };
    setBoardBg(newBg);
    try {
      if (url) {
        localStorage.setItem(`roam_board_bg_${trip.id}`, JSON.stringify(newBg));
      } else {
        localStorage.removeItem(`roam_board_bg_${trip.id}`);
      }
    } catch { /* ignore */ }
    await supabase.from("trips").update({ kanban_background_url: url || null }).eq("id", trip.id);
    setShowBgPicker(false);
  };

  return (
    <HomeTownCtx.Provider value={homeTown}>
    <div
      className="relative flex flex-col h-dvh md:h-[calc(100dvh-64px)] overflow-hidden md:!bg-none md:!bg-[#F5F4F1]"
      style={boardBgStyle}
    >
      {/* Nav bar — mobile only (md:hidden). Desktop nav lives in Masthead. */}
      {/* z-30: the ⋯ menu drops out of this bar and must paint over the sticky
          day picker below it (z-20). Without it the menu's first rows hid
          behind "Day 1 of 12" (Brennan, from his phone, Sep 2026). */}
      <input ref={importInputRef} type="file" accept="application/pdf,image/*,.eml,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ""; }} />
      <JourneyHeader
        backHref="/"
        title={trip.title}
        onSearch={() => search.open()}
        menu={
          <AppMenu
            variant="mobile"
            tripId={trip.id}
            tripTitle={trip.title}
            trip={trip}
            days={days}
            triggerClassName="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors"
            extra={[
              // The board background stays a feature (its sheet is below), but
              // not a menu row: Brennan parked it, and the menu is for what a
              // journey needs. Bookings is the one row a host adds.
              {
                key: "bookings", title: "Bookings", sub: "",
                icon: <Files size={15} weight="light" />,
                onClick: () => setShowDocs(true),
              },
            ]}
          />
        }
      />

      {/* Board */}
      {(
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile ? (
            /* ── Mobile: single-day view with swipe navigation ── */
            <DndContext
              sensors={sensors}
              collisionDetection={listCollision}
              onDragStart={handleDragStart}
              onDragEnd={handleMobileDragEnd}
              onDragCancel={handleDragCancel}
            >
              {/* Day navigation header + dots — sticky on mobile */}
              <div className="sticky top-0 z-20 bg-white flex-shrink-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <button
                    aria-label="Previous day"
                    onClick={() => setMobileDayIdx((prev) => Math.max(prev - 1, mobileMinIdx))}
                    disabled={safeMobileIdx === mobileMinIdx}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-25"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  {days.length > 1 ? (
                    <DayPicker
                      days={days}
                      onSelect={(day) => setMobileDayIdx(days.findIndex((d) => d.id === day.id))}
                      mode="active"
                      activeDayId={currentMobileDay?.id}
                      align="center"
                    />
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">Day {currentMobileDay?.day_number}</p>
                      {currentMobileDay?.date && (
                        <p className="text-xs text-gray-400">{fmtDate(currentMobileDay.date)}</p>
                      )}
                    </div>
                  )}
                  <button
                    aria-label="Next day"
                    onClick={() => setMobileDayIdx((prev) => Math.min(prev + 1, days.length - 1))}
                    disabled={safeMobileIdx >= days.length - 1}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-25"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {/* The day's title on a phone: one read-only caption under the
                    pager, rendered only when a title exists so an untitled
                    day's header is exactly what it was. Editing is desktop-
                    only, like list rename. */}
                {currentMobileDay?.theme && (
                  <p className="text-center truncate px-6 pb-1 bg-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "12px", color: "rgba(26, 26, 46, 0.65)" }}>
                    {currentMobileDay.theme}
                  </p>
                )}
                {days.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5 py-1 bg-white">
                    {/* One dot per day. The leading dots for lists and their
                        composer went with lists themselves. */}
                    {lists.map((list, i) => (
                      <button
                        key={list.id}
                        onClick={() => setMobileDayIdx(mobileMinIdx + i)}
                        aria-label={list.title}
                        className={`rounded-full transition-all duration-200 ${
                          currentMobileList?.id === list.id ? "w-4 h-1.5 bg-gray-600" : "w-1.5 h-1.5 bg-gray-300"
                        }`}
                      />
                    ))}
                    {days.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setMobileDayIdx(i)}
                        className={`rounded-full transition-all duration-200 ${i === safeMobileIdx ? "w-4 h-1.5 bg-gray-600" : "w-1.5 h-1.5 bg-gray-300"}`}
                      />
                    ))}
                  </div>
                )}
              </div>


              {/* Swipeable day content */}
              {currentMobileDay && (
                <div
                  className="flex-1 min-h-0 overflow-hidden px-3 pt-2"
                  onTouchStart={handleSwipeTouchStart}
                  onTouchEnd={handleSwipeTouchEnd}
                >
                  {(allEmpty || showTemplatePicker) && days.length > 0 && (
                    <TemplateBanner
                      onSelect={(key) => { handleApplyTemplate(key); setShowTemplatePicker(false); }}
                      onDismiss={showTemplatePicker && !allEmpty ? () => setShowTemplatePicker(false) : undefined}
                    />
                  )}
                  <DayColumn
                    day={currentMobileDay}
                    cards={currentMobileDay.cards}
                    dayIndex={safeMobileIdx}
                    isPhotoBg={isPhotoBg}
                    fullWidth
                    onCardTap={(card) => setSelectedCard(card)}
                    onDelete={handleDelete}
                    onOpenComposer={() => setComposerDay(currentMobileDay)}
                    onAddFromSaved={() => setAddFromSavedDay(currentMobileDay)}
                  />
                </div>
              )}

              <DragOverlay>
                {activeCard && <CardTile card={activeCard} isOverlay />}
              </DragOverlay>
            </DndContext>
          ) : (
            /* ── Desktop: multi-column Kanban ── */
            <DndContext
              sensors={sensors}
              // ONE context, two kinds of draggable. See listCollision: a list
              // drag and a card drag are shown disjoint sets of droppables, so
              // the existing card behaviour (day↔list, list↔list, within-list)
              // is untouched and a list can never be nominated a day's target.
              collisionDetection={listCollision}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {/* Jump-to-day control row — shrink-0 direct flex child of the board
                  column. DndContext renders no DOM wrapper, so this sits above the
                  scroller and the scroller's flex-1 absorbs the rest with no calc. */}
              <div className="hidden md:flex md:items-center md:gap-2.5 md:px-7 md:pt-3 md:pb-2 shrink-0">
                {days.length > 1 && (
                  <DayPicker
                    days={days}
                    onSelect={handlePickDay}
                    mode="jump"
                    foldedDayIds={foldedDays}
                  />
                )}
                {days.length > 1 && showWeeks && (
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className={CTRL_CHIP}
                    style={{ letterSpacing: "-0.005em" }}
                  >
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                )}
              </div>

              {/* Board frame — relative so the edge fades can overlay the scroller. */}
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Edge fades — neutral scrim, reads over parchment and over any
                    photo background. Shown only on real overflow (see effect). */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 transition-opacity duration-200"
                  style={{ width: 44, background: "linear-gradient(to right, rgba(0,0,0,0.16), transparent)", opacity: fades.left ? 1 : 0 }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 transition-opacity duration-200"
                  style={{ width: 44, background: "linear-gradient(to left, rgba(0,0,0,0.16), transparent)", opacity: fades.right ? 1 : 0 }}
                />

                {/* Single horizontal scroll container — both the pinned header row
                    and the card columns live here so they pan together with no JS.
                    overflow-x handles horizontal scroll; overflow-y:hidden clips
                    vertical overflow while still establishing a proper scroll
                    container so child columns can scroll independently on iOS. */}
                <div
                  ref={scrollerRef}
                  className="board-x-scroll flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
                  style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", scrollbarColor: "rgba(26,26,46,0.28) transparent" } as React.CSSProperties}
                >
                <div className="p-4 pb-28 md:px-7 md:pb-6 md:flex md:flex-col md:h-full md:min-h-0">
                  {(allEmpty || showTemplatePicker) && days.length > 0 && (
                    <TemplateBanner
                      onSelect={(key) => { handleApplyTemplate(key); setShowTemplatePicker(false); }}
                      onDismiss={showTemplatePicker && !allEmpty ? () => setShowTemplatePicker(false) : undefined}
                    />
                  )}

                  {showWeeks ? (
                    <>
                      {/* Week-bar row — a third flex-shrink-0 child of the pad
                          div, above the pinned day-header row, so all three rows
                          live in the one X-scroller and pan together with no JS.
                          Each slot is exactly as wide as the week it labels and
                          every row below reuses that same width, so bars,
                          headers and columns cannot drift apart. The folded card
                          is positioned out of flow inside its slot: in flow it
                          would make this row as tall as a card and shove the
                          whole board down the moment one week folded. */}
                      {/* The gap below this row is for the week BARS. Folded
                          cards are out of flow, so with every week folded the
                          row is 0px and that gap would just push "Add a list"
                          off the top edge of the cards it sits beside. */}
                      <div className={`hidden md:flex md:flex-row md:flex-nowrap md:gap-5 md:min-w-max md:flex-shrink-0 ${allCollapsed ? "" : "md:mb-3"}`}>

                        {weekSlots.map(({ week, folded, width }) => (
                          <div
                            key={week.key}
                            data-week-key={week.key}
                            className="relative flex-shrink-0"
                            style={{ width }}
                          >
                            {folded ? (
                              /* Always at the row's top, level with the bars it
                                 shares the row with — and, when every week is
                                 folded and this row has no height of its own,
                                 level with "Add another list" in the header
                                 row directly beneath. */
                              <WeekFoldedCard
                                week={week}
                                onUnfold={() => handleUnfoldWeek(week)}
                              />
                            ) : (
                              <WeekBar week={week} onFold={(e) => handleFoldWeek(e, week)} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Pinned day-header row, grouped by week. A folded week
                          leaves an empty slot of the folded card's width — that
                          is what keeps every later week's bar over its own
                          columns. Empty slots have no height, so with every week
                          folded this row collapses to nothing by itself: no
                          guard, no reserved band. */}
                      <div className="hidden md:flex md:flex-row md:flex-nowrap md:gap-5 md:min-w-max md:flex-shrink-0">

                        {weekSlots.map(({ week, folded, width }) => (
                          <div key={week.key} className="flex-shrink-0" style={{ width }}>
                            {!folded && (
                              <div className="flex flex-row flex-nowrap gap-5">
                                {week.days.map((day) => (
                                  <DayHeaderCell key={day.id} day={day} weather={weatherByDate?.[day.date] ?? null} onRename={handleRenameDay} autoTitle={autoDayTitle(day, day.id === days[0]?.id, day.id === days[days.length - 1]?.id)} />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-row flex-nowrap gap-5 md:min-w-max md:flex-1 md:min-h-0">

                        {weekSlots.map(({ week, folded, width }) => (
                          <div key={week.key} className="flex-shrink-0 md:h-full md:min-h-0" style={{ width }}>
                            {!folded && (
                              <div className="flex flex-row flex-nowrap gap-5 md:h-full md:min-h-0">
                                {week.days.map((day) => renderColumn(day))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Pinned day-header row — first flex-shrink-0 child of pad.
                          Lives in the same X-scroller as the columns row, so it pans
                          horizontally in lockstep with zero JS; the X-scroller never
                          scrolls Y (overflow-y-hidden), so it stays pinned to the top
                          structurally — no position:sticky needed. Cells mirror the
                          column width (md:w-[280px]) and gap (md:gap-5) exactly. */}
                      <div className="hidden md:flex md:flex-row md:flex-nowrap md:gap-5 md:min-w-max md:flex-shrink-0">

                        {days.map((day) => (
                          <DayHeaderCell key={day.id} day={day} weather={weatherByDate?.[day.date] ?? null} onRename={handleRenameDay} autoTitle={autoDayTitle(day, day.id === days[0]?.id, day.id === days[days.length - 1]?.id)} />
                        ))}
                      </div>

                      <div className="flex flex-row flex-nowrap gap-[10px] md:gap-5 md:min-w-max md:flex-1 md:min-h-0">

                        {days.map((day) => renderColumn(day))}
                      </div>
                    </>
                  )}
                </div>
                </div>
              </div>

              <DragOverlay>
                {activeCard && <CardTile card={activeCard} isOverlay />}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}{/* end board */}

      {/* Card composer — same search-first sheet as the Agenda */}
      {composerDay && (
        <CreateCardSheet
          dayId={composerDay.id}
          tripId={trip.id}
          endPosition={composerDay.cards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          destination={trip.destination}
          destinationLat={trip.destination_lat}
          destinationLng={trip.destination_lng}
          onClose={() => setComposerDay(null)}
          onCardCreated={handleComposerCreated}
        />
      )}

      {/* List composer — the same sheet, with no day and a list. endPosition is
          the end of THAT list, so a card added here keeps the order the
          traveller can then drag it into. */}
      {composerList && (
        <CreateCardSheet
          dayId={null}
          listId={composerList.id}
          tripId={trip.id}
          endPosition={composerList.cards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          initialStatus="interested"
          destination={trip.destination}
          destinationLat={trip.destination_lat}
          destinationLng={trip.destination_lng}
          onClose={() => setComposerList(null)}
          onCardCreated={handleListCardCreated}
        />
      )}

      {pendingConf && (
        <ConfirmationPreviewSheet
          items={pendingConf.items}
          fileName={pendingConf.fileName}
          fileType={pendingConf.fileType}
          days={days}
          tripId={trip.id}
          onClose={() => setPendingConf(null)}
          onCardsCreated={(cards, deletedIds) => {
            setDays((prev) => {
              // Remove deleted skeleton cards
              let next = prev.map((d) => ({
                ...d,
                cards: deletedIds.length
                  ? d.cards.filter((c) => !deletedIds.includes(c.id))
                  : d.cards,
              }));
              // Add newly created cards
              for (const card of cards) {
                next = next.map((d) =>
                  d.id === card.day_id ? { ...d, cards: [...d.cards, card] } : d
                );
              }
              return next;
            });
            setPendingConf(null);
          }}
        />
      )}

      {showDocs && (
        <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} onImport={() => { setShowDocs(false); importInputRef.current?.click(); }} />
      )}

      {/* Journey notes — bottom sheet on mobile, modal at md+ */}
      {showNotes && (
        <JourneyNotesSheet
          tripId={trip.id}
          initialNotes={notes}
          onNotesChange={setNotes}
          onClose={() => setShowNotes(false)}
        />
      )}


      {importingConf && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in">
          Reading your booking…
        </div>
      )}

      {/* ── Board background URL sheet ── */}
      {showBgPicker && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowBgPicker(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-3 pb-2">
              <p className="text-center font-display italic text-base text-gray-900 mb-5">
                Board background
              </p>
              <input
                type="url"
                value={bgUrlInput}
                onChange={(e) => {
                  setBgUrlInput(e.target.value);
                  setBgPreviewError(false);
                }}
                placeholder="Paste an image URL…"
                autoFocus
                className="w-full text-[14px] border-b border-black/10 py-3 outline-none bg-transparent placeholder:text-gray-300 text-[#1A1A2E]"
              />
              {/* Live preview */}
              <div
                className="mt-4 w-full h-[120px] rounded-xl overflow-hidden"
                style={{ background: "#E8E3DA" }}
              >
                {bgUrlInput.trim() && !bgPreviewError && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bgUrlInput.trim()}
                    alt="Background preview"
                    className="w-full h-full object-cover"
                    onError={() => setBgPreviewError(true)}
                  />
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-3">
              <button
                onClick={async () => {
                  setSavingBg(true);
                  await handleBgSave(bgUrlInput.trim());
                  setSavingBg(false);
                }}
                disabled={savingBg || !bgUrlInput.trim()}
                className="w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 active:scale-[0.99] transition-all"
              >
                {savingBg ? "Saving…" : "Save"}
              </button>
              {isPhotoBg && (
                <button
                  onClick={async () => {
                    setSavingBg(true);
                    await handleBgSave("");
                    setSavingBg(false);
                  }}
                  className="w-full text-center text-[13px] text-gray-400 py-2"
                >
                  Remove background
                </button>
              )}
              <button
                onClick={() => setShowBgPicker(false)}
                className="w-full text-center text-[13px] text-gray-400 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleDelete}
          onCardCopied={handleCardCopied}
          days={days}
          tripDestination={trip.destination}
        />
      )}

      {addFromSavedDay && (
        <LinkPlaceSheet
          mode="create"
          tripId={trip.id}
          day={addFromSavedDay}
          scheduledPlaceIds={scheduledPlaceIds}
          onAdded={handleSavedAdded}
          onClose={() => setAddFromSavedDay(null)}
        />
      )}
    </div>
    </HomeTownCtx.Provider>
  );
}

// ── TemplateBanner ─────────────────────────────────────────────
function TemplateBanner({ onSelect, onDismiss }: { onSelect: (key: string) => void; onDismiss?: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-4 shadow-card w-full md:max-w-xl">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[13px] font-bold text-gray-800">Start with a day template?</p>
        {onDismiss && (
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── DayColumn ──────────────────────────────────────────────────
interface DayColumnProps {
  day: DayWithCards;
  cards: Card[];
  dayIndex: number;
  isPhotoBg?: boolean;
  fullWidth?: boolean;
  onCardTap: (card: Card) => void;
  onDelete: (cardId: string) => void;
  onOpenComposer: () => void;
  onAddFromSaved: () => void;
}

function DayColumn({ day, cards, dayIndex, fullWidth, onCardTap, onDelete, onOpenComposer }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${day.id}` });

  return (
    <div data-col-idx={dayIndex} className={fullWidth ? "w-full h-full flex flex-col" : "w-[148px] min-w-[148px] flex-shrink-0 md:w-[280px] md:h-full md:min-h-0 flex flex-col"}>
      {/* Card column body */}
      <div
        style={fullWidth ? { backgroundColor: 'rgba(255,255,255,0.88)' } : undefined}
        className={`rounded-xl overflow-hidden flex flex-col scrollbar-none [touch-action:pan-y] ${
          fullWidth
            ? "backdrop-blur-md flex-1 min-h-0 overflow-y-auto"
            : "md:flex-1 md:min-h-0"
        }`}
      >

        {/* Cards drop zone + add button — bounded Y-scroller; the day header
            now lives in the pinned header row above the columns (DayHeaderCell). */}
        <div className={`p-3 flex flex-col scrollbar-none [touch-action:pan-y] ${
          fullWidth
            ? ""
            : "max-h-[calc(100dvh-11rem)] overflow-y-auto md:max-h-none md:flex-1 md:min-h-0 md:overflow-y-auto"
        }`}>
          <div
            ref={setNodeRef}
            className={`min-h-[72px] shrink-0 rounded-lg transition-colors ${
              isOver && cards.length === 0 ? "bg-black/5" : ""
            } ${fullWidth ? "overflow-y-auto pb-4" : ""}`}
          >
            <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {cards.map((card) => (
                <SortableCardTile
                  key={card.id}
                  card={card}
                  dayDate={day.date}
                  onTap={() => onCardTap(card)}
                  onDelete={() => onDelete(card.id)}
                />
              ))}
            </SortableContext>

            {cards.length === 0 && !isOver && (
              <div className="h-16 rounded-lg border-2 border-dashed border-black/10 flex items-center justify-center">
                <p className="text-xs text-black/25">Drop cards here</p>
              </div>
            )}
          </div>

          {/* Add a place — flush below the last card, the one door on both
              widths: the sheet lists saved places first, then a Google search.
              The desktop's batch "Add from saved" button went the same way
              (Brennan, Sep 2026: "not needed anymore"). */}
          <div className="flex flex-col gap-2 shrink-0">
            <AddPlaceRow onClick={onOpenComposer} />
          </div>
        </div>
      </div>{/* end card column body */}
    </div>
  );
}

// ── placeTown ──────────────────────────────────────────────────
// "Via Buranco, 14, 19016 Monterosso al Mare SP, Italy" → "Monterosso al Mare".
// Google's formatted_address puts the locality in the second-to-last segment,
// as "<postcode> <town> <province code>" in Italy and "<town>, <state> <zip>"
// elsewhere. Strip a leading postcode and a trailing 2-letter province, and
// give up (null) rather than guess when the address has fewer than three parts.
/**
 * The town, from a Google formatted_address.
 *
 * The old rule was "second-to-last comma segment". That is the town in Italy
 * and almost nowhere else, which is how 54 New York cards came to read "NY",
 * 25 California ones "CA", and Costa Rica ones a bare "50101":
 *
 *   235 Mulberry St, New York, NY 10012, USA          → NY        ✗
 *   ...Blvd. Aeropuerto, Liberia, 50101, Costa Rica   → 50101     ✗
 *   ...Sydney NSW 2000, Australia                     → Sydney NSW ✗
 *   Via delle Conce, 45, 55100 Lucca LU, Italy        → Lucca     ✓
 *
 * So: drop the country, then walk BACKWARDS to the first segment that still
 * holds a real word once postcodes and state codes are stripped off it. Italy
 * packs the town into the postal segment ("55100 Lucca LU"), the US puts it in
 * its own one before it ("New York", then "NY 10012") — walking back handles
 * both without knowing which country it is looking at.
 *
 * An address with no digits anywhere has no postcode and no street number to
 * anchor on, and its segments can be anything: "Tamarindo, Guanacaste, Costa
 * Rica" opens with a town, "Skull Rock, California, USA" opens with a rock,
 * and "California, USA" is a state on its own. Guessing at the first segment
 * printed "Skull Rock" and "California" as towns on the Palm Springs board.
 * There is no rule that tells those apart, so this returns nothing rather than
 * something wrong — a blank says "no town", a wrong town says something false.
 */
/**
 * "9:20 AM – 10:55 AM" becomes "9:20 – 10:55 AM". Both halves of a range are
 * nearly always the same half of the day, and saying so twice is what pushed
 * the line past the column and truncated the town mid-word. A range that does
 * cross noon keeps both, because there the second one is load-bearing.
 */
function compactRange(range: string | null): string | null {
  if (!range) return null;
  return range.replace(/^(\d{1,2}:\d{2}) (AM|PM) – (\d{1,2}:\d{2}) \2$/, "$1 – $3 $2");
}

/**
 * What a day would call itself.
 *
 * Deliberately dumb, because it has to be predictable and it has to re-derive
 * itself instantly when a card moves — no model call, no stored answer.
 *
 *   • a flight on the FIRST day is an arrival, on the LAST day a departure.
 *     Direction cannot come from sub_type: both ends of a trip are stored as
 *     "flight_arrival" (see the trip-import notes), so the day's position in
 *     the journey is the only honest signal;
 *   • otherwise the day's longest ACTIVITY — not its longest meal, and not its
 *     transit. What you did is what the day was;
 *   • otherwise the first real place on it;
 *   • a day of nothing but notes gets no name, because it has nothing to say.
 */
function autoDayTitle(day: DayWithCards, isFirst: boolean, isLast: boolean): string | null {
  const cards = day.cards.filter((c) => c.status !== "cut");
  if (!cards.length) return null;

  const isFlight = (c: Card) =>
    c.place?.sub_type === "flight_arrival" || c.place?.sub_type === "flight_departure";
  if (isFirst && cards.some(isFlight)) return "Arrival";
  if (isLast && cards.some(isFlight)) return "Departure";

  const minutes = (c: Card) => {
    if (!c.start_time || !c.end_time) return 0;
    const [h1, m1] = c.start_time.split(":").map(Number);
    const [h2, m2] = c.end_time.split(":").map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  };

  const ACTIVITY = new Set(["guided", "self_directed", "event", "challenge", "wellness"]);
  const activities = cards.filter((c) => c.place && ACTIVITY.has(c.place.sub_type ?? ""));
  if (activities.length) {
    const best = activities.reduce((a, b) => (minutes(b) > minutes(a) ? b : a));
    if (best.place?.title) return best.place.title;
  }

  const firstPlace = cards.find((c) => c.place?.title);
  return firstPlace?.place?.title ?? null;
}

function placeTown(address?: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const segs = parts.slice(0, -1); // the last one is the country
  if (!segs.length) return null;

  const clean = (raw: string) =>
    raw
      .replace(/^\d{3,6}\s+/, "")            // "00186 Roma RM"
      .replace(/\s+\d{3,6}(-\d{4})?$/, "")   // "NY 10012", "Sydney NSW 2000"
      .replace(/\s+[A-Z]{2,3}$/, "")         // "Roma RM", "Sydney NSW"
      .trim();

  const usable = (seg: string) =>
    seg.length > 0 &&
    seg.length <= 40 &&
    !/^\d+$/.test(seg) &&                    // a bare postcode
    !(seg.length <= 3 && seg === seg.toUpperCase()); // a bare "NY" / "CA"

  if (!/\d/.test(address)) return null;

  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = clean(segs[i]);
    if (usable(seg)) return seg;
  }
  return null;
}

/**
 * The name of a town as someone would say it.
 *
 * Google returns administrative names in full: "San Martino in Freddana -
 * Monsagrati". At 10.5px in 176px that clipped to "San Martino in Fre…", which
 * is not a place — it is where the pixels ran out.
 *
 * Two cuts, in order, and BOTH only on a name too long to fit:
 *   • a compound of two settlements keeps the first ("X - Y" → "X");
 *   • a trailing "in/al/sul/di/de/…" phrase comes off, which is exactly how
 *     these names shorten in speech (San Martino in Freddana → San Martino,
 *     Monterosso al Mare → Monterosso).
 *
 * The 18-character floor is what stops it mangling short names that happen to
 * contain the same words — "Rio de Janeiro" is 14 and survives whole. And what
 * is left has to be a real fragment: at least 8 characters, or the cut is not
 * worth making and the name keeps its ellipsis instead.
 */
const TOWN_FITS = 18;

// Words that are a category, not a name. "Provincia de Guanacaste" shortens to
// "Provincia", which is worse than the full string and worse than nothing — the
// name is on the far side of the connector, not the near one.
const NOT_A_NAME = /^(provincia|province|region|regione|comune|municipality|municipio|county|district|city|ciudad|departamento|prefecture)$/i;

function shortTown(town: string | null): string | null {
  if (!town || town.length <= TOWN_FITS) return town;

  const firstOfCompound = town.split(/\s+[-–—]\s+/)[0].trim();
  if (firstOfCompound.length >= 8 && firstOfCompound.length < town.length) {
    town = firstOfCompound;
    if (town.length <= TOWN_FITS) return town;
  }

  const trimmed = town.replace(
    /\s+(in|al|all'|alla|sul|sulla|di|del|della|dei|de|d'|am|an der|sur|sous|upon|on)\s+.+$/i,
    "",
  ).trim();
  if (trimmed.length >= 8 && trimmed.length < town.length && !NOT_A_NAME.test(trimmed)) return trimmed;

  return town;
}

/**
 * The journey's home town — the one most of its cards are in, or null when no
 * town repeats.
 *
 * A card prints its town only when it is somewhere ELSE. That is the whole
 * rule, and it survives every shape of trip:
 *
 *   New York     home New York   → nothing, except the airport in East Elmhurst
 *   Palm Springs home Palm Springs → nothing, until the Joshua Tree day, where
 *                                  Joshua Tree, Pioneertown, Palm Desert, Indio
 *                                  and Whitewater each say so
 *   Tuscany      home Lucca      → Pisa, Firenze, Montefoscoli, San Martino
 *
 * A first attempt asked "does the trip cross more than one town" and printed
 * the town on every card when it did. Palm Springs is what killed it: 12 of its
 * 18 towns are Palm Springs, so the test said "one town, print nothing" and the
 * day trips — the only cards where the town matters — lost theirs.
 *
 * Blank means home. That is not a shape a card is missing; it is the answer.
 *
 * Context rather than a prop: CardTile is reached through DayColumn,
 * SortableCardTile and a DragOverlay, and threading one fact about the trip
 * through all of them is not worth the noise.
 */
const HomeTownCtx = createContext<string | null>(null);

// ── DayHeaderCell ──────────────────────────────────────────────
// Lifted out of DayColumn into the pinned header row. Reads the day's
// cards (live) so the STOP/H caption updates as cards move. Mirrors the
// column width (md:w-[280px]) so each header sits exactly above its column.
function DayHeaderCell({ day, weather, onRename, autoTitle }: { day: DayWithCards; weather?: DayWeather | null; onRename?: (dayId: string, theme: string) => void; autoTitle?: string | null }) {
  const wxBtnRef = useRef<HTMLButtonElement>(null);
  // Day title — the optional line under the weekday. Same commit rules as a
  // list rename: Enter and blur commit, Escape reverts.
  const titleRef = useRef<HTMLInputElement>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(day.theme ?? "");
  const startTitleEdit = () => {
    setTitleDraft(day.theme ?? "");
    setTitleEditing(true);
    setTimeout(() => titleRef.current?.select(), 0);
  };
  const commitTitle = () => {
    setTitleEditing(false);
    if (onRename && titleDraft.trim() !== (day.theme ?? "")) onRename(day.id, titleDraft);
  };
  const [wxOpen, setWxOpen] = useState(false);
  const [wxPos, setWxPos] = useState<{ left: number; top: number } | null>(null);
  const dayOfWeek = day.date
    ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
    : null;
  const shortDateTitle = day.date
    ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  // Stop/hour counts were dropped (Brennan, Aug 26): the cards below the
  // header already show how full a day is. The date line carries the
  // forecast instead, keeping the header to three tiers.

  return (
    <div className="md:w-[280px] md:flex-shrink-0" style={{ padding: "14px 16px 12px" }}>
      {/* Tier 1 — DAY NUMBER · DATE (same small-caps register, one line) */}
      <p style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: "9.5px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "rgba(26, 26, 46, 0.62)",
        marginBottom: "4px",
      }}>Day {day.day_number}{shortDateTitle ? ` · ${shortDateTitle}` : ""}</p>
      {/* Tier 2 — Day of week (italic Playfair). On an untitled day the
          weekday is also the door to naming it: tap it and the title editor
          opens below. That replaces the dotted prompt every column carried. */}
      {dayOfWeek && (
        onRename && !day.theme && !autoTitle && !titleEditing ? (
          <button
            type="button"
            onClick={startTitleEdit}
            title="Name this day"
            aria-label={`${dayOfWeek} — tap to name this day`}
            className="block text-left hover:opacity-70 transition-opacity"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "22px",
              fontWeight: 500,
              fontStyle: "italic",
              color: "rgb(26, 26, 46)",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              marginBottom: "6px",
              background: "none",
              border: 0,
              padding: 0,
            }}
          >{dayOfWeek}</button>
        ) : (
          <p style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "22px",
            fontWeight: 500,
            fontStyle: "italic",
            color: "rgb(26, 26, 46)",
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            marginBottom: "6px",
          }}>{dayOfWeek}</p>
        )
      )}
      {/* Tier 2½ — the day's title, typed by the traveller. Reads as a caption
          under the weekday; tap to edit. When empty and editable, a faint
          dotted prompt so the affordance exists without shouting. Read-only
          viewers see the title or nothing. */}
      {titleEditing ? (
        <input
          ref={titleRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            if (e.key === "Escape") { setTitleDraft(day.theme ?? ""); setTitleEditing(false); }
          }}
          placeholder={autoTitle ? `${autoTitle} — clear to keep this automatic` : "Lucca day, Rest, Cinque Terre…"}
          aria-label={`Title for day ${day.day_number}`}
          className="w-full bg-transparent outline-none border-b border-[rgba(26,26,46,0.25)] focus:border-[#B0541F] placeholder:text-[rgba(26,26,46,0.28)]"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "12.5px", color: "rgb(26, 26, 46)", marginBottom: "6px", padding: "1px 0" }}
        />
      ) : (day.theme ?? autoTitle) ? (
        onRename ? (
          <button
            type="button"
            onClick={startTitleEdit}
            title={day.theme ? "Rename this day" : "This name comes from the day's plan — tap to write your own"}
            className="block w-full text-left truncate hover:opacity-70 transition-opacity"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "12.5px", color: "rgba(26, 26, 46, 0.72)", marginBottom: "6px", padding: "1px 0" }}
          >
            {day.theme ?? autoTitle}
          </button>
        ) : (
          <p className="truncate" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "12.5px", color: "rgba(26, 26, 46, 0.72)", marginBottom: "6px", padding: "1px 0" }}>
            {day.theme ?? autoTitle}
          </p>
        )
      ) : null}
      {/* No dotted "Name this day" prompt: twelve of them on a twelve-day board
          were noise (simplification audit, Sep 2026). An untitled day is
          named by tapping its weekday above, which carries the hint. */}

      {/* Tier 3 — Forecast (only inside the ~2-week window Open-Meteo covers;
          far-out days simply have a two-line header). Clicking opens the
          hourly strip in a floating popover — position:fixed because the
          pinned header row lives in an overflow-clipped X-scroller. */}
      {weather && (
        <>
          <button
            ref={wxBtnRef}
            onClick={() => {
              const rect = wxBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              setWxPos({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 420)),
                top: rect.bottom + 8,
              });
              setWxOpen(true);
            }}
            className="flex items-center gap-1.5 cursor-pointer"
            aria-label="Hourly forecast"
          >
            <WeatherIcon category={getWeatherCategory(weather.condition_code)} size={12} />
            <span style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "10.5px",
              fontWeight: 500,
              color: "rgba(26, 26, 46, 0.60)",
            }}>
              {weather.high_c}°/{weather.low_c}°
              {weather.precip_probability_max > 30 ? ` · ${weather.precip_probability_max}% rain` : ""}
            </span>
          </button>
          {wxOpen && wxPos && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWxOpen(false)} />
              <div
                className="fixed z-50 w-[404px] bg-white rounded-2xl p-4"
                style={{
                  left: wxPos.left,
                  top: wxPos.top,
                  border: "1px solid rgba(26,26,46,0.12)",
                  boxShadow: "0 8px 30px rgba(26,26,46,0.14)",
                }}
              >
                <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-activity/50 mb-3">
                  Hourly — {dayOfWeek}
                </div>
                <HourlyStrip weather={weather} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Named lists ────────────────────────────────────────────────
// Trello's own columns, translated: cards that belong to the journey but no
// particular day, filed under a name the traveller chose. One app-named bucket
// flattened "Research", "Prep" and "Logistics" into one pile; three columns
// with three names do not.
//
// Membership is opt-in (cards.list_id) — see the page's list query for why
// unscheduled must not mean "on a list".
//
// The header borrows DayHeaderCell's three-tier register so it sits in the same
// band as the day headers, and drops the two things that make a day a day: the
// date line and the forecast. The name occupies the weekday's slot, because the
// name is what a list has instead of a date.


// ── Week bar / folded week card ────────────────────────────────
// Geometry and typography follow design-reference/long-trip/week-folding.html.
// The mockup draws day headers inside each column; this board does not — only
// the look of these two elements is taken from it, never its structure.

const WEEK_LABEL: React.CSSProperties = {
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(26,26,46,0.45)",
  whiteSpace: "nowrap",
};

// The 20px sign circle. An affordance only — the whole bar and the whole card
// are the control, so the glyph is aria-hidden and the button carries the label.
const SIGN =
  "w-5 h-5 flex-shrink-0 grid place-items-center rounded-full text-[15px] leading-none " +
  "text-[rgba(26,26,46,0.45)] transition-colors " +
  "group-hover:text-[#B0541F] group-hover:bg-[rgba(196,98,45,0.10)]";

function WeekBar({
  week,
  onFold,
}: {
  week: PlanWeek<DayWithCards>;
  onFold: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onFold}
      aria-label={`Collapse week ${week.weekNumber}, ${week.range}`}
      title={`Collapse ${week.range}`}
      className="group w-full flex items-center gap-[11px] text-left rounded-[9px] px-[13px] py-2
                 border border-[rgba(26,26,46,0.12)] bg-[rgba(26,26,46,0.025)]
                 hover:border-[rgba(26,26,46,0.22)] hover:bg-[rgba(26,26,46,0.055)] transition-colors"
    >
      <span
        className="font-display italic"
        style={{ fontSize: "15px", fontWeight: 500, color: "#1A1A2E", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}
      >
        {week.range}
      </span>
      <span style={WEEK_LABEL}>
        Week {week.weekNumber}{week.isPartial ? " · part week" : ""}
      </span>
      <span aria-hidden className={`ml-auto ${SIGN}`}>−</span>
    </button>
  );
}

// Out of flow inside its slot so folding never changes the week-bar row's
// height — and now the SAME HEIGHT as a bar, so it cannot hang down into the
// day-header band either. A folded week is the same object as an open one, one
// row of the same padding and the same 15px range, only 140px wide instead of
// the full span; white and shadowed so it still reads as closed. It lost the
// "Week N" label and the day count: at 140px there is room for the range and
// the +, and both survive in the title and aria-label.
function WeekFoldedCard({
  week,
  onUnfold,
}: {
  week: PlanWeek<DayWithCards>;
  onUnfold: () => void;
}) {
  const count = week.days.length;
  return (
    <button
      type="button"
      onClick={onUnfold}
      aria-label={`Expand week ${week.weekNumber}, ${week.range}, ${count} ${count === 1 ? "day" : "days"}`}
      title={`Expand ${week.range}`}
      className="group absolute top-0 left-0 w-full flex items-center gap-[11px] text-left rounded-[9px] px-[13px] py-2
                 bg-white border border-[rgba(26,26,46,0.12)] hover:border-[rgba(26,26,46,0.24)]
                 shadow-card hover:shadow-card-hover transition-all"
    >
      <span
        className="font-display italic truncate"
        style={{ fontSize: "15px", fontWeight: 500, color: "#1A1A2E", letterSpacing: "-0.01em" }}
      >
        {week.range}
      </span>
      <span aria-hidden className={`ml-auto ${SIGN}`}>+</span>
    </button>
  );
}

// ── SortableCardTile ───────────────────────────────────────────
function SortableCardTile({
  card,
  dayDate,
  onTap,
  onDelete,
}: {
  card: Card;
  dayDate: string | null;
  onTap: () => void;
  /** Omitted on the lists: the hover trash there would delete the card
   *  outright, and the only non-destructive exit from a list is a drag. */
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        touchAction: "pan-y",
      }}
      {...attributes}
      {...listeners}
    >
      <CardTile card={card} dayDate={dayDate} onTap={onTap} onDelete={onDelete} />
    </div>
  );
}

// ── CardTile ───────────────────────────────────────────────────
function CardTile({
  card,
  dayDate,
  onTap,
  onDelete,
  isOverlay,
}: {
  card: Card;
  dayDate?: string | null;
  onTap?: () => void;
  onDelete?: () => void;
  isOverlay?: boolean;
}) {
  const homeTown    = useContext(HomeTownCtx);
  const place       = card.place;
  const det         = card.details as Record<string, unknown>;
  const isNote      = place == null;
  // Unlinked cards default to activity-style border for color consistency
  const placeType   = place?.type ?? "activity";
  const borderClass = isNote ? "border-l-gray-200" : (TYPE_BORDER[placeType] ?? "border-l-gray-300");
  const subLabel    = subTypeLabel(place?.sub_type);
  const noteSnippet = isNote ? (det?.notes as string | undefined) : undefined;
  const title       = place?.title ?? (det?.title as string | undefined) ?? noteSnippet?.slice(0, 60) ?? "(untitled note)";

  const timeRange = formatTimeRange(card.start_time, card.end_time);

  // Opening-hours conflict signal — silent unless the scheduled time clashes.
  const hoursSignal = place ? getOpeningHoursConflict(place.hours, dayDate ?? null, card.start_time) : null;

  return (
    <div
      className={`group relative bg-white rounded-xl border border-gray-100 shadow-card mb-2 select-none overflow-hidden border-l-[3px] ${borderClass} ${isOverlay ? "shadow-[0_8px_24px_0_rgba(0,0,0,0.14)] scale-[1.02]" : ""}`}
    >
      {/* The cover. A place's photo across the top of the card, the way
          Brennan's own Trello trip boards do it, instead of a 40px chip beside
          the words. Only a card with a place gets one: a note ("Pool. On
          purpose.") stays flat text, exactly as the text-only cards do on his
          board, so the covers still mean something.

          The category icon sits under the photo and IS the fallback — a place
          whose photo fails to load shows its icon on the parchment tile rather
          than a hole. */}
      {place && (
        <div
          className="relative w-full overflow-hidden flex items-center justify-center text-[#1A1A2E]"
          style={{ height: 96, background: "#E8E3DA" }}
        >
          <span
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(place.sub_type, 22) }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/places/photo?place_id=${place.id}&size=full`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
      )}
      <button onClick={onTap} className="w-full text-left p-3 md:px-3 md:py-2.5">
        <div className="flex items-start gap-2.5 md:items-center md:gap-3">

          {/* Text content — now the whole width. Dropping the 40px chip and its
              12px gap gave this line 52px back, which is what had been cutting
              "San Martino in Freddana" short. */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 leading-snug line-clamp-2 md:text-[13.5px] md:font-medium md:line-clamp-2 md:tracking-[-0.005em]">
              {title}
            </p>
            {hoursSignal && (
              <p className={`text-[11px] ${openingHoursTone(hoursSignal)} mt-0.5 leading-snug truncate`}>
                {openingHoursCaption(hoursSignal)}
              </p>
            )}
            {(() => {
              // ONE grammar, every card: time · kind · town.
              //
              // It used to be time · kind · town · ★rating · price, with three
              // of the five appearing only on some cards — a restaurant showed
              // five things, a transit stop three, a note a paragraph of prose.
              // No two cards were the same shape, so there was nothing to read
              // down. Rating and price now live in the card and on the map,
              // where you are choosing; the board is where you are checking.
              // Time first and in ink: it is what the eye is looking for, and
              // weight says so without spending the accent, which is reserved
              // for the opening-hours warning on this very line.
              const shownTime = compactRange(timeRange);
              const kind = isNote ? "Note" : subLabel;
              // Blank means home. Only somewhere else earns the words.
              const rawTown = placeTown(place?.address);
              const town = rawTown && rawTown !== homeTown ? shortTown(rawTown) : null;
              if (!shownTime && !kind && !town) return null;

              // A flex row, not a truncated paragraph. There are 176px here and
              // "2:00 PM · Hotel · San Martino in Freddana - Monsagrati" wants
              // 278; clipping the whole line took the town's name off in the
              // middle of a word and, on tighter lines, ate five pixels of
              // "Lucca". Time and kind are flex-shrink-0 so they are never the
              // thing that goes; the town is the only part that gives ground,
              // and it ellipsises on its own.
              // 2px, not 3: the two separators on a full line are 4px, and 4px
              // was the whole difference between "Lucca" and "Lucc…".
              const sep = <span className="mx-[2px]">·</span>;
              // One line again. The town was moved to a row of its own back when
              // a 40px chip sat beside the words and left 176px to write in —
              // "8:45 – 9:45 AM · Self-directed · Twentynine Palms" wanted 64px
              // more than existed. The cover took that chip away and handed the
              // line 52px back, so the town fits where it belongs.
              //
              // Still a flex row: time and kind never shrink, and the town is the
              // only part that gives ground on the rare name long enough to need
              // it.
              return (
                <p className="flex items-baseline text-[10.5px] text-gray-400 mt-0.5 leading-snug min-w-0">
                  {shownTime && (
                    <span className="flex-shrink-0 text-[#1A1A2E] font-semibold">{shownTime}</span>
                  )}
                  {kind && (
                    <span className="flex-shrink-0">{shownTime && sep}{kind}</span>
                  )}
                  {town && (
                    <span className="min-w-0 truncate">{(shownTime || kind) && sep}{town}</span>
                  )}
                </p>
              );
            })()}
            {/* Checklist progress and attachment count — Trello's card-face
                indicators, and this board is the Trello-equivalent surface.
                Renders nothing when the card has neither, so a card that has
                never had a list is unchanged. */}
            <CardBadges card={card} className="mt-1.5" />
          </div>

        </div>
      </button>

      {/* Hover trash — desktop only, no menu or confirmation */}
      {!isOverlay && onDelete && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-400 hover:bg-red-50 transition-all"
          aria-label="Delete card"
        >
          <Trash size={14} weight="light" />
        </button>
      )}
    </div>
  );
}
