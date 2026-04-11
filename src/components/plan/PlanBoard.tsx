"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import ConfirmationPreviewSheet, { type ParsedConfirmation } from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import TriageView from "@/components/plan/TriageView";
import BoardBgPicker, { type BoardBg } from "@/components/plan/BoardBgPicker";
import type { Trip, Card, DayWithCards, CardType, CardStatus } from "@/types/database";
import { getPriceRange } from "@/lib/priceRange";

import CardImage from "@/components/ui/CardImage";
import { Trash, DotsThree } from "@phosphor-icons/react";

// ── Constants ──────────────────────────────────────────────────
const COL_PREFIX = "col-";

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

// Sub-types that are "travel boundaries" — stripped from middle-day copies
const TRAVEL_SUB_TYPES = new Set(["flight_arrival", "flight_departure", "hotel"]);

function makeCards(dayId: string, tripId: string, skeletons: SkeletonDef[]): Card[] {
  return skeletons.map((s, i) => ({
    id:              crypto.randomUUID(),
    day_id:          dayId,
    trip_id:         tripId,
    type:            s.type,
    sub_type:        s.sub_type,
    title:           s.title,
    start_time:      s.start_time + ":00",
    end_time:        s.end_time ? s.end_time + ":00" : null,
    position:        i + 1,
    status:          "in_itinerary" as CardStatus,
    source_url:      null,
    cover_image_url: null,
    lat:             null,
    lng:             null,
    address:         null,
    details:         {},
    ai_generated:    false,
    created_at:      new Date().toISOString(),
  }));
}

// ── Helpers ────────────────────────────────────────────────────
function fmt12(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}

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
}

export default function PlanBoard({ trip, initialDays }: Props) {
  const supabase = createClient();
  const [days, setDays] = useState<DayWithCards[]>(initialDays);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [pendingConf,  setPendingConf]  = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [showDocs,     setShowDocs]     = useState(false);
  const [viewMode] = useState<"board" | "triage">("board");
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [boardBg, setBoardBg] = useState<BoardBg>(() => {
    if (typeof window === "undefined") return { type: "color", value: "#ffffff" };
    try {
      const stored = localStorage.getItem(`roam_board_bg_${trip.id}`);
      if (stored) return JSON.parse(stored) as BoardBg;
    } catch { /* ignore */ }
    return { type: "color", value: "#ffffff" };
  });

  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIdx, setMobileDayIdx] = useState(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const daysRef = useRef(days);
  daysRef.current = days;

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
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) })));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    if (error) {
      setDays(snapshot);
      setDeleteToast("Couldn't delete — please try again.");
      setTimeout(() => setDeleteToast(null), 3000);
    }
  }, [supabase]);

  // ── Inline card creation (board view) ───────────────────────
  const handleCreateCard = useCallback(async (dayId: string, title: string) => {
    const day = days.find((d) => d.id === dayId);
    const endPos = day ? day.cards.reduce((m, c) => Math.max(m, c.position), 0) + 1 : 1;
    const id = crypto.randomUUID();
    const newCard: Card = {
      id, day_id: dayId, trip_id: trip.id,
      type: "activity", sub_type: null, title,
      start_time: null, end_time: null, position: endPos,
      status: "in_itinerary", source_url: null, cover_image_url: null,
      lat: null, lng: null, address: null, details: {}, ai_generated: false,
      created_at: new Date().toISOString(),
    };
    setDays((prev) =>
      prev.map((d) => d.id === dayId ? { ...d, cards: [...d.cards, newCard] } : d)
    );
    const { error } = await supabase.from("cards").insert({
      id, day_id: dayId, trip_id: trip.id,
      type: "activity", sub_type: null, title,
      start_time: null, end_time: null, position: endPos,
      status: "in_itinerary", lat: null, lng: null,
      address: null, details: {}, ai_generated: false,
    });
    if (error) {
      setDays((prev) =>
        prev.map((d) => d.id === dayId ? { ...d, cards: d.cards.filter((c) => c.id !== id) } : d)
      );
    }
  }, [days, trip.id, supabase]);

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
      allNewCards.push(...makeCards(day.id, trip.id, skeletons));
    });

    // Optimistic update
    setDays((prev) =>
      prev.map((day) => ({ ...day, cards: allNewCards.filter((c) => c.day_id === day.id) }))
    );

    // Persist
    const rows = allNewCards.map((c) => ({
      id: c.id, day_id: c.day_id, trip_id: c.trip_id,
      type: c.type, sub_type: c.sub_type, title: c.title,
      start_time: c.start_time, end_time: c.end_time,
      position: c.position, status: c.status,
      source_url: null, cover_image_url: null,
      lat: null, lng: null, address: null, details: {},
      ai_generated: false,
    }));
    await supabase.from("cards").insert(rows);
  }, [days, trip.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Copy day structure to all other days ─────────────────────
  const handleCopyStructure = useCallback(async (srcDayId: string) => {
    const cur = daysRef.current;
    const srcDay = cur.find((d) => d.id === srcDayId);
    if (!srcDay) return;

    // Extract base structure (type/sub_type/times) from source cards
    const baseDefs: SkeletonDef[] = srcDay.cards.map((c) => ({
      type:       c.type,
      sub_type:   c.sub_type ?? "self_directed",
      title:      c.title,
      start_time: c.start_time?.slice(0, 5) ?? "09:00",
      end_time:   c.end_time?.slice(0, 5) ?? null,
    }));

    const allNewCards: Card[] = [];
    const idsToDelete: string[] = [];

    cur.forEach((day, idx) => {
      if (day.id === srcDayId) return;
      idsToDelete.push(...day.cards.map((c) => c.id));

      const isFirst = idx === 0;
      const isLast  = idx === cur.length - 1 && cur.length > 1;

      let skeletons: SkeletonDef[];
      if (isFirst) {
        // Prepend arrival cards, strip travel sub-types from the copy
        const stripped = baseDefs.filter((s) => !TRAVEL_SUB_TYPES.has(s.sub_type));
        skeletons = [...DAY1_CARDS, ...stripped];
      } else if (isLast) {
        // Append departure, strip departure from the copy to avoid duplicates
        const stripped = baseDefs.filter((s) => s.sub_type !== "flight_departure");
        skeletons = [...stripped, { type: "logistics", sub_type: "flight_departure", title: "Departure", start_time: "12:00", end_time: null }];
      } else {
        skeletons = baseDefs;
      }

      allNewCards.push(...makeCards(day.id, trip.id, skeletons));
    });

    // Optimistic update (source day unchanged)
    setDays((prev) =>
      prev.map((day) =>
        day.id === srcDayId ? day : { ...day, cards: allNewCards.filter((c) => c.day_id === day.id) }
      )
    );

    // Persist
    if (idsToDelete.length) {
      await supabase.from("cards").delete().in("id", idsToDelete);
    }
    if (allNewCards.length) {
      const rows = allNewCards.map((c) => ({
        id: c.id, day_id: c.day_id, trip_id: c.trip_id,
        type: c.type, sub_type: c.sub_type, title: c.title,
        start_time: c.start_time, end_time: c.end_time,
        position: c.position, status: c.status,
        source_url: null, cover_image_url: null,
        lat: null, lng: null, address: null, details: {},
        ai_generated: false,
      }));
      await supabase.from("cards").insert(rows);
    }
  }, [trip.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear all itinerary cards ────────────────────────────────
  const handleClearItinerary = useCallback(async () => {
    setClearConfirm(false);
    const allIds = days.flatMap((d) => d.cards.map((c) => c.id));
    if (!allIds.length) return;
    // Optimistic update
    setDays((prev) => prev.map((d) => ({ ...d, cards: [] })));
    // Only delete cards that are in_itinerary with a day_id
    await supabase.from("cards")
      .delete()
      .eq("trip_id", trip.id)
      .eq("status", "in_itinerary")
      .not("day_id", "is", null);
  }, [days, trip.id, supabase]);

  const firstDay    = initialDays[0];
  const activeCard  = activeId ? findCard(activeId) : null;
  const allEmpty    = days.every((d) => d.cards.length === 0);
  const safeMobileIdx = Math.min(mobileDayIdx, Math.max(0, days.length - 1));
  const currentMobileDay = days[safeMobileIdx];

  const boardBgStyle: React.CSSProperties =
    boardBg.type === "photo"
      ? { backgroundImage: `url(${boardBg.url})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: boardBg.value };

  const isPhotoBg = boardBg.type === "photo";

  const handleBgSelect = (bg: BoardBg) => {
    setBoardBg(bg);
    try { localStorage.setItem(`roam_board_bg_${trip.id}`, JSON.stringify(bg)); } catch { /* ignore */ }
    setShowBgPicker(false);
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={boardBgStyle}>
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        {/* Home button */}
        <Link
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors flex-shrink-0"
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
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Days
          </Link>
        )}
        {/* Board / Triage toggle — hidden from UI; keep code for future re-enable */}
        {/* <div className="flex items-center gap-0.5 ml-2 bg-gray-100 rounded-lg p-0.5">
          {(["board", "triage"] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === mode ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
              {mode === "board" ? "Board" : "Triage"}
            </button>
          ))}
        </div> */}

        {/* Spacer — pushes right-side controls to the edge */}
        <span className="flex-1" />

        {/* Trip settings */}
        <Link
          href={`/trips/${trip.id}/settings`}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          aria-label="Trip settings"
        >
          <DotsThree size={20} weight="light" />
        </Link>

        {/* Plan ··· menu */}
        <PlanMenu
          onClearItinerary={() => setClearConfirm(true)}
          onApplyTemplate={() => setShowTemplatePicker(true)}
        />

        {/* Board background picker */}
        <button
          onClick={() => setShowBgPicker(true)}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          aria-label="Change board background"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34" />
            <polygon points="18 2 22 6 12 16 8 16 8 12 18 2" />
          </svg>
        </button>

        {/* Right side actions — docs and upload removed */}
      </div>{/* end sub-header */}

      {/* Triage view */}
      {viewMode === "triage" && (
        <TriageView tripId={trip.id} days={days} />
      )}

      {/* Board */}
      {viewMode === "board" && (
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
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">Day {currentMobileDay?.day_number}</p>
                    {currentMobileDay?.date && (
                      <p className="text-xs text-gray-400">{fmtDate(currentMobileDay.date)}</p>
                    )}
                  </div>
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
                    onCreateCard={(title) => handleCreateCard(currentMobileDay.id, title)}
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
              {/* Single horizontal scroll container — both the sticky header row
                  and the card columns live here so they pan together with no JS.
                  overflow-x handles horizontal scroll; overflow-y:hidden clips
                  vertical overflow while still establishing a proper scroll
                  container so child columns can scroll independently on iOS. */}
              <div
                className="flex-1 overflow-x-auto overflow-y-hidden"
                style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" } as React.CSSProperties}
              >
                {/* Sticky header row */}
                <div
                  className="sticky top-0 z-20 flex flex-row flex-nowrap gap-[10px] md:gap-4 px-4"
                  style={
                    isPhotoBg
                      ? { background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)" }
                      : { background: "rgba(255,255,255,0.95)" }
                  }
                >
                  {days.map((day) => (
                    <DayColumnHeader
                      key={day.id}
                      day={day}
                      totalDays={days.length}
                      onCopyStructure={() => handleCopyStructure(day.id)}
                    />
                  ))}
                </div>

                {/* Card columns */}
                <div className="p-4 pb-28 md:pb-6">
                  {(allEmpty || showTemplatePicker) && days.length > 0 && (
                    <TemplateBanner
                      onSelect={(key) => { handleApplyTemplate(key); setShowTemplatePicker(false); }}
                      onDismiss={showTemplatePicker && !allEmpty ? () => setShowTemplatePicker(false) : undefined}
                    />
                  )}

                  <div className="flex flex-row flex-nowrap gap-[10px] md:gap-4 md:min-w-max">
                    {days.map((day, idx) => (
                      <DayColumn
                        key={day.id}
                        day={day}
                        cards={day.cards}
                        dayIndex={idx}
                        isPhotoBg={isPhotoBg}
                        onCardTap={(card) => setSelectedCard(card)}
                        onDelete={handleDelete}
                        onCreateCard={(title) => handleCreateCard(day.id, title)}
                      />
                    ))}
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

      {/* Clear itinerary confirmation dialog */}
      {clearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-2xl shadow-sheet p-6 max-w-sm w-full">
            <p className="text-[15px] font-bold text-gray-900 mb-2">Clear itinerary?</p>
            <p className="text-[13px] text-gray-500 mb-5">
              This will remove all itinerary cards. Your map pins will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearItinerary}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in">
          {deleteToast}
        </div>
      )}

      {showBgPicker && (
        <BoardBgPicker
          current={boardBg}
          onSelect={handleBgSelect}
          onClose={() => setShowBgPicker(false)}
        />
      )}

      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleDelete}
          days={days}
          tripDestination={trip.destination}
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

// ── DayColumnHeader ────────────────────────────────────────────
interface DayColumnHeaderProps {
  day: DayWithCards;
  totalDays: number;
  onCopyStructure: () => void;
}

function DayColumnHeader({ day, totalDays, onCopyStructure }: DayColumnHeaderProps) {
  return (
    <div className="w-[148px] min-w-[148px] flex-shrink-0 md:w-72 flex items-start justify-between py-2">
      <div>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-gray-800">Day {day.day_number}</span>
          {day.date && (
            <>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-500 font-medium">{fmtDate(day.date)}</span>
            </>
          )}
        </div>
      </div>
      {totalDays > 1 && <CopyMenu onCopyStructure={onCopyStructure} />}
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
  onCreateCard: (title: string) => Promise<void>;
}

function DayColumn({ day, cards, isPhotoBg, fullWidth, onCardTap, onDelete, onCreateCard }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${day.id}` });
  const [isInlineAdding, setIsInlineAdding] = useState(false);
  const [inlineTitle,    setInlineTitle]    = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInlineAdding) setTimeout(() => inlineRef.current?.focus(), 40);
  }, [isInlineAdding]);

  const submitInline = async () => {
    const t = inlineTitle.trim();
    setIsInlineAdding(false);
    setInlineTitle("");
    if (t) await onCreateCard(t);
  };

  const dismissInline = () => { setIsInlineAdding(false); setInlineTitle(""); };

  return (
    <div className={fullWidth ? "w-full h-full" : "w-[148px] min-w-[148px] flex-shrink-0 md:w-72"}>
      {/* Column container — Trello-style gray pill; on mobile fills height and inner card list scrolls */}
      <div className={`${isPhotoBg ? "bg-[#EBECF0]/80 backdrop-blur-sm" : "bg-[#EBECF0]"} rounded-xl p-3 flex flex-col max-h-[calc(100dvh-8rem)] overflow-y-auto scrollbar-none [touch-action:pan-y] md:max-h-none md:overflow-y-visible`}>
        {/* Cards drop zone — independently scrollable on mobile */}
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-[72px] rounded-lg transition-colors ${
            isOver && cards.length === 0 ? "bg-[#D0D2D8]" : ""
          } ${fullWidth ? "overflow-y-auto pb-4" : ""}`}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <SortableCardTile
                key={card.id}
                card={card}
                onTap={() => onCardTap(card)}
                onDelete={() => onDelete(card.id)}
              />
            ))}
          </SortableContext>

          {cards.length === 0 && !isOver && (
            <div className="h-16 rounded-lg border-2 border-dashed border-[#D0D2D8] flex items-center justify-center">
              <p className="text-xs text-[#B0B3BC]">Drop cards here</p>
            </div>
          )}
        </div>

        {/* Inline add / Add button */}
        <div className="mt-1">
          {isInlineAdding ? (
            <div className="flex gap-1.5 pt-1">
              <input
                ref={inlineRef}
                value={inlineTitle}
                onChange={(e) => setInlineTitle(e.target.value)}
                placeholder="Name this stop..."
                className="flex-1 text-[13px] bg-white rounded-lg border border-gray-200 px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder:text-gray-300 min-w-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitInline(); }
                  if (e.key === "Escape") dismissInline();
                }}
                onBlur={() => setTimeout(dismissInline, 150)}
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={submitInline}
                className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold text-white flex-shrink-0"
                style={{ background: "#1A1A2E" }}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsInlineAdding(true)}
              className="w-full flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 transition-colors"
            >
              <span className="text-base leading-none font-bold">+</span> Add to this day
            </button>
          )}
        </div>
      </div>{/* end column container */}
    </div>
  );
}

// ── CopyMenu (day header "···" menu) ──────────────────────────
function CopyMenu({ onCopyStructure }: { onCopyStructure: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 mt-0.5"
        aria-label="Day options"
      >
        <span className="text-[10px] font-black leading-none tracking-widest">···</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-sheet border border-gray-100 py-1 min-w-[200px]">
            <button
              className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onCopyStructure();
              }}
            >
              Copy structure to all days
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── PlanMenu (sub-header "···" menu) ──────────────────────────
function PlanMenu({ onClearItinerary, onApplyTemplate }: { onClearItinerary: () => void; onApplyTemplate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
        aria-label="Plan options"
      >
        <span className="text-[10px] font-black leading-none tracking-widest">···</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 bg-white rounded-xl shadow-sheet border border-gray-100 py-1 min-w-[220px]">
            <button
              className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => { setOpen(false); onApplyTemplate(); }}
            >
              Apply new template
            </button>
            <div className="mx-3 border-t border-gray-100" />
            <button
              className="w-full text-left px-4 py-2.5 text-[13px] text-red-500 hover:bg-gray-50 transition-colors"
              onClick={() => { setOpen(false); onClearItinerary(); }}
            >
              Clear itinerary cards
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── SortableCardTile ───────────────────────────────────────────
function SortableCardTile({
  card,
  onTap,
  onDelete,
}: {
  card: Card;
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
      <CardTile card={card} onTap={onTap} onDelete={onDelete} />
    </div>
  );
}

// ── CardTile ───────────────────────────────────────────────────
function CardTile({
  card,
  onTap,
  onDelete,
  isOverlay,
}: {
  card: Card;
  onTap?: () => void;
  onDelete?: () => void;
  isOverlay?: boolean;
}) {
  const isNote      = card.sub_type === "note";
  const borderClass = isNote ? "border-l-gray-200" : (TYPE_BORDER[card.type] ?? "border-l-gray-300");
  const subLabel    = card.sub_type ? (SUB_LABEL[card.sub_type] ?? card.sub_type) : null;
  const noteSnippet = isNote ? ((card.details as Record<string, unknown>)?.notes as string | undefined) : undefined;
  const det         = card.details as Record<string, unknown>;
  const tileRating  = card.type === "food" && typeof det?.rating === "number" ? det.rating as number : null;
  const priceRange  = card.type === "food"
    ? getPriceRange(det?.price_level as number | undefined, det?.currency_code as string | undefined)
    : null;

  const timeRange = (() => {
    const s = fmt12(card.start_time);
    const e = fmt12(card.end_time);
    if (s && e) return `${s} – ${e}`;
    return s || null;
  })();

  return (
    <div
      className={`group relative bg-white rounded-xl border border-gray-100 shadow-card mb-2 select-none overflow-hidden border-l-[3px] ${borderClass} ${isOverlay ? "shadow-[0_8px_24px_0_rgba(0,0,0,0.14)] scale-[1.02]" : ""}`}
    >
      <button onClick={onTap} className="w-full text-left p-3">
        <div className="flex items-start gap-2.5">

          {/* Thumbnail — 60×60 */}
          <CardImage
            src={card.cover_image_url}
            alt=""
            className="w-[60px] h-[60px] rounded-lg object-cover flex-shrink-0"
            lat={card.lat}
            lng={card.lng}
            subType={card.sub_type}
            title={card.title}
          />

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 leading-snug line-clamp-2">
              {card.title}
            </p>
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
