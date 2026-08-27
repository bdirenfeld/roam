"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
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
import CardBottomSheet from "@/components/cards/CardBottomSheet";
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
import type { Trip, Card, Day, DayWithCards, CardType, CardStatus } from "@/types/database";
import {
  groupDaysIntoWeeks,
  shouldShowWeeks,
  weekSlotWidth,
  readFoldedDays,
  writeFoldedDays,
  type PlanWeek,
} from "@/lib/planWeeks";
import { getPriceRange } from "@/lib/priceRange";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { formatTimeRange } from "@/lib/formatTime";
import { getOpeningHoursConflict, openingHoursCaption, openingHoursTone } from "@/lib/openingHours";

import CardImage from "@/components/ui/CardImage";
import { Trash, DotsThree, Image as ImageIcon, Gear, ShareNetwork, BookmarkSimple, UploadSimple, Files, NotePencil, MagnifyingGlass } from "@phosphor-icons/react";
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import { TripSettingsLink } from "@/components/overlays/AppOverlays";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { type DayWeather, fetchTripWeather, dayStopsAnchor, getWeatherCategory, WeatherIcon, HourlyStrip } from "@/lib/weather";

// ── Constants ──────────────────────────────────────────────────
const COL_PREFIX = "col-";

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


const SUB_LABEL: Record<string, string> = {
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
  self_directed:    "Self-directed",
  guided:           "Guided",
  hosted:           "Guided",
  wellness:         "Wellness",
  beach:            "Beach",
  challenge:        "Challenge",
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  cocktail_bar:     "Cocktail bar",
  drinks:           "Drinks",
  note:             "Note",
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

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── PlanBoard ──────────────────────────────────────────────────
interface Props {
  trip: Trip;
  initialDays: DayWithCards[];
  /** trips.notes — arrives with the page payload so notes work offline. */
  initialNotes: string | null;
}

export default function PlanBoard({ trip, initialDays, initialNotes }: Props) {
  const supabase = createClient();
  const [days, setDays] = useState<DayWithCards[]>(initialDays);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [addFromSavedDay, setAddFromSavedDay] = useState<DayWithCards | null>(null);
  // Composer day — the board uses the same search-first sheet as the Agenda
  const [composerDay, setComposerDay] = useState<DayWithCards | null>(null);
  const [pendingConf,  setPendingConf]  = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [showDocs,     setShowDocs]     = useState(false);
  // Journey notes — the sheet unmounts on close, so the latest text is held
  // here; re-opening it shows what was just written, not the page payload.
  const [showNotes,    setShowNotes]    = useState(false);
  const [notes,        setNotes]        = useState<string | null>(initialNotes);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  // Undo window after an instant delete — holds the removed card for re-insert
  const [undoDelete, setUndoDelete] = useState<{ card: Card; dayId: string } | null>(null);
  const undoDeleteRef = useRef<{ card: Card; dayId: string } | null>(null);
  useEffect(() => { undoDeleteRef.current = undoDelete; }, [undoDelete]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setDeleteToast(e instanceof Error ? e.message : "Couldn't read that file.");
      setTimeout(() => setDeleteToast(null), 4000);
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
  // Mid-trip, the mobile board opens on today's column, not Day 1
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
  }, [isMobile, days.length, foldedDays]);

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

  const findCard = useCallback(
    (id: string) => daysRef.current.flatMap((d) => d.cards).find((c) => c.id === id),
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
      await Promise.all(
        updates.map((u) =>
          supabase.from("cards").update({ day_id: u.day_id, position: u.position }).eq("id", u.id)
        )
      );
    },
    [supabase]
  );

  // ── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    preDragSnapshot.current = daysRef.current;
    crossColumnMoved.current = false;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
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
      setDays(snapshot);
    }
  }, [persistChanges]);

  // ── Mobile drag (within-day only) ─────────────────────────────
  const handleMobileDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
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
    }
  }, [persistChanges]);

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
      if (dx < 0) setMobileDayIdx((prev) => Math.min(prev + 1, daysRef.current.length - 1));
      else setMobileDayIdx((prev) => Math.max(prev - 1, 0));
    }
  }, []);

  // ── Card edits ────────────────────────────────────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
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
  }, []);

  const handleDelete = useCallback(async (cardId: string) => {
    const snapshot = daysRef.current;
    const fromDay = snapshot.find((d) => d.cards.some((c) => c.id === cardId));
    const deleted = fromDay?.cards.find((c) => c.id === cardId) ?? null;
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) })));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    if (error) {
      setDays(snapshot);
      setDeleteToast("Couldn't delete — please try again.");
      setTimeout(() => setDeleteToast(null), 3000);
      return;
    }
    // Deletes are instant (no confirm dialog), so offer a window to undo
    if (deleted && fromDay) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoDelete({ card: deleted, dayId: fromDay.id });
      undoTimerRef.current = setTimeout(() => setUndoDelete(null), 6000);
    }
  }, [supabase]);

  const handleUndoDelete = useCallback(async () => {
    const u = undoDeleteRef.current;
    if (!u) return;
    setUndoDelete(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { card } = u;
    // Re-insert the row with its original id so attachments/links keep working
    const { error } = await supabase.from("cards").insert({
      id: card.id, day_id: card.day_id, trip_id: card.trip_id,
      start_time: card.start_time, end_time: card.end_time,
      position: card.position, status: card.status, source_url: card.source_url,
      details: card.details, ai_generated: card.ai_generated,
      confirmed: card.confirmed, place_id: card.place_id,
    });
    if (error) {
      setDeleteToast("Couldn't restore the card.");
      setTimeout(() => setDeleteToast(null), 3000);
      return;
    }
    setDays((prev) =>
      prev.map((d) =>
        d.id === u.dayId
          ? { ...d, cards: [...d.cards, card].sort((a, b) => a.position - b.position) }
          : d
      )
    );
  }, [supabase]);

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
    const { error } = await supabase.from("cards").insert(rows);
    if (error) {
      console.error("[PlanBoard.handleApplyTemplate] card insert failed:", error);
      setDays(snapshot);
    }
  }, [days, trip.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps


  const firstDay    = initialDays[0];
  const activeCard  = activeId ? findCard(activeId) : null;
  const allEmpty    = days.every((d) => d.cards.length === 0);
  const safeMobileIdx = Math.min(mobileDayIdx, Math.max(0, days.length - 1));
  const currentMobileDay = days[safeMobileIdx];

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
    <div
      className="relative flex flex-col h-dvh md:h-[calc(100dvh-64px)] overflow-hidden md:!bg-none md:!bg-[#FAF7F2]"
      style={boardBgStyle}
    >
      {/* Nav bar — mobile only (md:hidden). Desktop nav lives in Masthead. */}
      <div className="md:hidden relative flex items-center h-11 px-3 flex-shrink-0">
        {/* Left: back buttons */}
        <div className="flex items-center gap-1 z-10">
          <Link
            href="/"
            className="flex items-center justify-center w-9 h-9 rounded-full transition-colors text-white/70 md:text-[#1A1A2E]"
            aria-label="Back to home"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          {firstDay && (
            <Link
              href={`/trips/${trip.id}/days/${firstDay.id}`}
              className="flex items-center gap-1 text-xs font-semibold transition-colors text-white/70 md:text-[#1A1A2E]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Days
            </Link>
          )}
        </div>

        {/* Center: trip title */}
        <span className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
          <span
            className="font-display italic text-[15px] md:text-[#1A1A2E]"
          >
            {trip.title}
          </span>
        </span>

        {/* Right: single ··· menu */}
        <div className="ml-auto z-10">
          <MainMenu
            trip={trip}
            days={days}
            onOpenBgPicker={() => {
              setBgUrlInput(boardBg.type === "photo" ? boardBg.url : "");
              setBgPreviewError(false);
              setShowBgPicker(true);
            }}
            onImportBooking={handleImportFile}
            onOpenDocuments={() => setShowDocs(true)}
            onOpenNotes={() => setShowNotes(true)}
          />
        </div>
      </div>{/* end nav bar */}

      {/* Board */}
      {(
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMobile ? (
            /* ── Mobile: single-day view with swipe navigation ── */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleMobileDragEnd}
            >
              {/* Day navigation header + dots — sticky on mobile */}
              <div className="sticky top-0 z-20 bg-white flex-shrink-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <button
                    onClick={() => setMobileDayIdx((prev) => Math.max(prev - 1, 0))}
                    disabled={safeMobileIdx === 0}
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
                    onClick={() => setMobileDayIdx((prev) => Math.min(prev + 1, days.length - 1))}
                    disabled={safeMobileIdx >= days.length - 1}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-25"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {days.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5 py-1 bg-white">
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
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Jump-to-day control row — shrink-0 direct flex child of the board
                  column. DndContext renders no DOM wrapper, so this sits above the
                  scroller and the scroller's flex-1 absorbs the rest with no calc. */}
              {days.length > 1 && (
                <div className="hidden md:flex md:items-center md:gap-2.5 md:px-7 md:pt-3 md:pb-2 shrink-0">
                  <DayPicker
                    days={days}
                    onSelect={handlePickDay}
                    mode="jump"
                    foldedDayIds={foldedDays}
                  />
                  {showWeeks && (
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
              )}

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
                      <div className="hidden md:flex md:flex-row md:flex-nowrap md:gap-5 md:min-w-max md:flex-shrink-0 md:mb-3">
                        {weekSlots.map(({ week, folded, width }) => (
                          <div
                            key={week.key}
                            data-week-key={week.key}
                            className="relative flex-shrink-0"
                            style={{ width }}
                          >
                            {folded ? (
                              <WeekFoldedCard week={week} onUnfold={() => handleUnfoldWeek(week)} />
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
                                  <DayHeaderCell key={day.id} day={day} weather={weatherByDate?.[day.date] ?? null} />
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
                          <DayHeaderCell key={day.id} day={day} weather={weatherByDate?.[day.date] ?? null} />
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
        <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} />
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


      {deleteToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in">
          {deleteToast}
        </div>
      )}

      {undoDelete && !deleteToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-medium pl-4 pr-1.5 py-1.5 rounded-full shadow-lg flex items-center gap-3 animate-in fade-in">
          <span>Card deleted</span>
          <button
            onClick={handleUndoDelete}
            className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {importingConf && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in">
          Reading your booking…
        </div>
      )}

      {/* ── Kanban background URL sheet ── */}
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
                Kanban background
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

function DayColumn({ day, cards, dayIndex, fullWidth, onCardTap, onDelete, onOpenComposer, onAddFromSaved }: DayColumnProps) {
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

          {/* Add a card — flush below last card, inside column surface.
              Both doors now lead somewhere real: saved places, or a Google
              search (the same sheet the Agenda uses). */}
          <div className="flex flex-col gap-2 shrink-0">
            {/* Door 1 — "Add from saved" reads first (quiet filled chip). */}
            <button
              onClick={onAddFromSaved}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 active:opacity-70 transition-opacity"
              style={{
                background: "#F2EDE3",
                boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontWeight: 600, fontSize: "13.5px", color: "#1A1A2E", letterSpacing: "-0.005em",
              }}
            >
              <BookmarkSimple size={14} weight="light" color="#1A1A2E" />
              Add from saved
            </button>
            {/* Door 2 — search-first composer. */}
            <button
              onClick={onOpenComposer}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 active:opacity-70 transition-opacity"
              style={{
                border: "1px dashed rgba(26,26,46,0.20)",
                fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic",
                fontSize: "14px", color: "rgba(26,26,46,0.40)", letterSpacing: "-0.005em",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.40)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add a card
            </button>
          </div>
        </div>
      </div>{/* end card column body */}
    </div>
  );
}

// ── DayHeaderCell ──────────────────────────────────────────────
// Lifted out of DayColumn into the pinned header row. Reads the day's
// cards (live) so the STOP/H caption updates as cards move. Mirrors the
// column width (md:w-[280px]) so each header sits exactly above its column.
function DayHeaderCell({ day, weather }: { day: DayWithCards; weather?: DayWeather | null }) {
  const wxBtnRef = useRef<HTMLButtonElement>(null);
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
        color: "rgba(26, 26, 46, 0.55)",
        marginBottom: "4px",
      }}>Day {day.day_number}{shortDateTitle ? ` · ${shortDateTitle}` : ""}</p>
      {/* Tier 2 — Day of week (italic Playfair, uppercased) */}
      {dayOfWeek && (
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
      )}
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
  "group-hover:text-[#C4622D] group-hover:bg-[rgba(196,98,45,0.10)]";

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

// Positioned out of flow inside its slot so folding never changes the height of
// the week-bar row. Top-aligned with the bars and sharing their 8px top padding,
// it occupies the vertical band the bar vacated — the "top" row's 20px min-height
// is the sign circle's diameter, which puts the + in the band the − just left.
// Horizontal parity is not achievable: the − sits at the right edge of a bar up
// to ~2,080px wide, the + at the right edge of a 140px card.
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
      aria-label={`Expand week ${week.weekNumber}, ${week.range}`}
      title={`Expand ${week.range}`}
      className="group absolute top-0 left-0 w-full text-left rounded-[9px] bg-white
                 border border-[rgba(26,26,46,0.12)] hover:border-[rgba(26,26,46,0.24)]
                 shadow-card hover:shadow-card-hover transition-all"
      style={{ padding: "8px 13px 14px" }}
    >
      <span className="flex items-center justify-between gap-2" style={{ minHeight: 20 }}>
        <span style={WEEK_LABEL}>Week {week.weekNumber}</span>
        <span aria-hidden className={SIGN}>+</span>
      </span>
      <span
        className="block font-display italic"
        style={{ fontSize: "19px", lineHeight: 1.15, marginTop: "9px", color: "#1A1A2E", letterSpacing: "-0.01em" }}
      >
        {week.range}
      </span>
      <span
        className="block"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "10px", fontWeight: 500, color: "rgba(26,26,46,0.45)", marginTop: "4px" }}
      >
        {count} {count === 1 ? "day" : "days"}
      </span>
    </button>
  );
}

// ── MainMenu (consolidated top-right ··· menu) ────────────────
function MainMenu({
  trip,
  days,
  onOpenBgPicker,
  onImportBooking,
  onOpenDocuments,
  onOpenNotes,
}: {
  /** Handed to the Settings overlay as a seed — the board already has both. */
  trip: Trip;
  days: Day[];
  onOpenBgPicker: () => void;
  onImportBooking: (file: File) => void;
  onOpenDocuments: () => void;
  onOpenNotes: () => void;
}) {
  const [open, setOpen] = useState(false);
  const search = useGlobalSearch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors bg-white/20 backdrop-blur-sm border border-white/25 text-white md:bg-black/[0.06] md:border-black/[0.08] md:text-[#1A1A2E]"
        aria-label="More options"
      >
        <DotsThree size={18} weight="bold" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 bg-white/97 backdrop-blur-xl rounded-xl shadow-xl w-[210px] py-1 overflow-hidden">
            {/* Search — the mobile ⌕ lives in the app header, which doesn't
                render inside a journey. This is how you reach it from the board. */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={() => { setOpen(false); search.open(); }}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MagnifyingGlass size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Search</p>
                <p className="text-[11px] text-gray-400 leading-snug">Journeys, places, wishlist</p>
              </div>
            </button>

            {/* Change background */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={() => { setOpen(false); onOpenBgPicker(); }}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <ImageIcon size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Change background</p>
                <p className="text-[11px] text-gray-400 leading-snug">Paste an image URL</p>
              </div>
            </button>

            {/* Trip settings — opens over the board, which keeps its scroll.
                Still a link to the route, so ctrl/cmd-click opens the page. */}
            <TripSettingsLink
              tripId={trip.id}
              trip={trip}
              days={days}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onBeforeOpen={() => setOpen(false)}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Gear size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Settings</p>
                <p className="text-[11px] text-gray-400 leading-snug">Dates, travellers, cover</p>
              </div>
            </TripSettingsLink>

            {/* Journey notes — opens in place; the board keeps its scroll */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={() => { setOpen(false); onOpenNotes(); }}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <NotePencil size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Journey notes</p>
                <p className="text-[11px] text-gray-400 leading-snug">Codes, packing, who&rsquo;s driving</p>
              </div>
            </button>

            {/* Divider */}
            <div className="mx-3 my-0.5 border-t border-gray-100" />

            {/* Import a booking → parse → preview cards */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <UploadSimple size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Import a booking</p>
                <p className="text-[11px] text-gray-400 leading-snug">Flight or hotel confirmation → cards</p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) { setOpen(false); onImportBooking(file); }
              }}
            />

            {/* Documents — previously uploaded confirmations */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={() => { setOpen(false); onOpenDocuments(); }}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Files size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Documents</p>
                <p className="text-[11px] text-gray-400 leading-snug">Uploaded confirmations</p>
              </div>
            </button>

            {/* Share itinerary — lives in Journey settings. The #share deep
                link still works as a URL; in the overlay the section is
                scrolled into view instead. */}
            <TripSettingsLink
              tripId={trip.id}
              trip={trip}
              days={days}
              section="share"
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onBeforeOpen={() => setOpen(false)}
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <ShareNetwork size={15} weight="light" className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">Share itinerary</p>
                <p className="text-[11px] text-gray-400 leading-snug">Invite someone to this journey</p>
              </div>
            </TripSettingsLink>
          </div>
        </>
      )}
    </div>
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
  onDelete: () => void;
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
  const place       = card.place;
  const det         = card.details as Record<string, unknown>;
  const isNote      = place == null;
  // Unlinked cards default to activity-style border for color consistency
  const placeType   = place?.type ?? "activity";
  const borderClass = isNote ? "border-l-gray-200" : (TYPE_BORDER[placeType] ?? "border-l-gray-300");
  const subLabel    = place?.sub_type ? (SUB_LABEL[place.sub_type] ?? place.sub_type) : null;
  const noteSnippet = isNote ? (det?.notes as string | undefined) : undefined;
  const tileRating  = place?.type === "food" ? place.rating : null;
  const priceRange  = place?.type === "food"
    ? getPriceRange(place.price_level ?? undefined, det?.currency_code as string | undefined)
    : null;
  const title       = place?.title ?? (det?.title as string | undefined) ?? noteSnippet?.slice(0, 60) ?? "(untitled note)";

  const timeRange = formatTimeRange(card.start_time, card.end_time);

  // Opening-hours conflict signal — silent unless the scheduled time clashes.
  const hoursSignal = place ? getOpeningHoursConflict(place.hours, dayDate ?? null, card.start_time) : null;

  return (
    <div
      className={`group relative bg-white rounded-xl border border-gray-100 shadow-card mb-2 select-none overflow-hidden border-l-[3px] ${borderClass} ${isOverlay ? "shadow-[0_8px_24px_0_rgba(0,0,0,0.14)] scale-[1.02]" : ""}`}
    >
      <button onClick={onTap} className="w-full text-left p-3 md:px-3 md:py-2.5">
        <div className="flex items-start gap-2.5 md:items-center md:gap-3">

          {/* Mobile thumbnail — 60×60 (only when card is linked to a place) */}
          {place && (
            <CardImage
              src={`/api/places/photo?place_id=${place.id}`}
              alt=""
              className="md:hidden w-[60px] h-[60px] rounded-lg object-cover flex-shrink-0"
              lat={place.lat}
              lng={place.lng}
              subType={place.sub_type}
              title={place.title}
            />
          )}

          {/* Desktop photo chip — 40×40, place photo over the category icon.
              Mirrors the mobile proxy thumbnail (same /api/places/photo call);
              on load failure the photo hides and the category icon shows through
              — the icon chip IS the fallback (per the Plan pinned-header mockup). */}
          <div
            className="hidden md:flex relative flex-shrink-0 items-center justify-center overflow-hidden text-[#1A1A2E]"
            style={{ width: 40, height: 40, borderRadius: 9, background: "#E8E3DA", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.08)" }}
          >
            <span
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(place?.sub_type, 16) }}
            />
            {place && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/places/photo?place_id=${place.id}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 leading-snug line-clamp-2 md:text-[13.5px] md:font-medium md:line-clamp-2 md:tracking-[-0.005em]">
              {title}
            </p>
            {hoursSignal && (
              <p className={`text-[11px] ${openingHoursTone(hoursSignal)} mt-0.5 leading-snug truncate`}>
                {openingHoursCaption(hoursSignal)}
              </p>
            )}
            {isNote && noteSnippet ? (
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{noteSnippet}</p>
            ) : (
              (() => {
                const parts: React.ReactNode[] = [];
                if (timeRange) parts.push(timeRange);
                if (subLabel && !isNote) parts.push(subLabel);
                if (tileRating !== null) parts.push(<span key="r" className="text-amber-500">★ {tileRating.toFixed(1)}</span>);
                if (priceRange) parts.push(priceRange);
                if (parts.length === 0) return null;
                return (
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug truncate">
                    {parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)}
                  </p>
                );
              })()
            )}
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
