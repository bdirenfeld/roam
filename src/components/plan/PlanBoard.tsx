"use client";

import { useState, useCallback, useRef } from "react";
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
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import ConfirmationPreviewSheet, { type ParsedConfirmation } from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import TriageView from "@/components/plan/TriageView";
import BoardBgPicker, { type BoardBg } from "@/components/plan/BoardBgPicker";
import type { Trip, Card, DayWithCards, CardType, CardStatus } from "@/types/database";

// ── Constants ──────────────────────────────────────────────────
const COL_PREFIX = "col-";

const TYPE_BORDER: Record<CardType, string> = {
  logistics: "border-l-logistics",
  activity:  "border-l-activity",
  food:      "border-l-food",
};

const TYPE_TEXT: Record<CardType, string> = {
  logistics: "text-logistics",
  activity:  "text-activity",
  food:      "text-food",
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
  const [createSheetDayId, setCreateSheetDayId] = useState<string | null>(null);
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

  // ── Card edits ────────────────────────────────────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
    setDays((prev) =>
      prev.map((d) => ({ ...d, cards: d.cards.map((c) => (c.id === updated.id ? updated : c)) }))
    );
    setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  const handleRemove = useCallback(async (cardId: string) => {
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) })));
    await supabase.from("cards").update({ status: "interested" }).eq("id", cardId);
  }, [supabase]);

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

  const handleCardCreated = useCallback((card: Card) => {
    setDays((prev) =>
      prev.map((d) => d.id === card.day_id ? { ...d, cards: [...d.cards, card] } : d)
    );
    setCreateSheetDayId(null);
    setSelectedCard(card);
  }, []);

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
    <div className="flex flex-col h-dvh" style={boardBgStyle}>
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
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
      {viewMode === "board" && <div
        className="flex-1 overflow-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" } as React.CSSProperties}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="p-4 pb-28 md:pb-6">
            {/* Template banner — only when every day is empty, or manually triggered */}
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
                  totalDays={days.length}
                  dayIndex={idx}
                  isPhotoBg={isPhotoBg}
                  onCardTap={(card) => setSelectedCard(card)}
                  onRemove={handleRemove}
                  onDelete={handleDelete}
                  onOpenCreateSheet={() => setCreateSheetDayId(day.id)}
                  onCopyStructure={() => handleCopyStructure(day.id)}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeCard && <CardTile card={activeCard} isOverlay />}
          </DragOverlay>
        </DndContext>
      </div>}{/* end board */}

      {createSheetDayId && (() => {
        const day = days.find((d) => d.id === createSheetDayId);
        const endPos = day ? day.cards.reduce((m, c) => Math.max(m, c.position), 0) + 1 : 1;
        return (
          <CreateCardSheet
            dayId={createSheetDayId}
            tripId={trip.id}
            endPosition={endPos}
            onClose={() => setCreateSheetDayId(null)}
            onCardCreated={handleCardCreated}
          />
        );
      })()}

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

// ── DayColumn ──────────────────────────────────────────────────
interface DayColumnProps {
  day: DayWithCards;
  cards: Card[];
  totalDays: number;
  dayIndex: number;
  isPhotoBg?: boolean;
  onCardTap: (card: Card) => void;
  onRemove: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onOpenCreateSheet: () => void;
  onCopyStructure: () => void;
}

function DayColumn({ day, cards, totalDays, isPhotoBg, onCardTap, onRemove, onDelete, onOpenCreateSheet, onCopyStructure }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${day.id}` });

  return (
    <div className="flex flex-col w-[260px] min-w-[260px] flex-shrink-0 md:w-72">
      {/* Column header — sticky on desktop so it stays visible while scrolling through cards */}
      <div className="flex items-start justify-between mb-2 md:sticky md:top-0 md:z-10 md:bg-white/90 md:backdrop-blur-sm md:rounded-xl md:px-3 md:-mx-3 md:py-2 md:mb-1">
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

      {/* Column container — Trello-style gray pill; on mobile fixed max-height with per-column scroll */}
      <div className={`${isPhotoBg ? "bg-[#EBECF0]/80 backdrop-blur-sm" : "bg-[#EBECF0]"} rounded-xl p-3 flex flex-col max-h-[calc(100dvh-11rem)] overflow-y-auto md:max-h-none md:overflow-y-visible`}>
        {/* Cards drop zone */}
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-[72px] rounded-lg transition-colors ${
            isOver && cards.length === 0 ? "bg-[#D0D2D8]" : ""
          }`}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <SortableCardTile
                key={card.id}
                card={card}
                onTap={() => onCardTap(card)}
                onRemove={() => onRemove(card.id)}
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

        {/* Add card */}
        <div className="mt-1 flex gap-1">
          <button
            onClick={onOpenCreateSheet}
            className="flex-1 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 transition-colors"
          >
            <span className="text-base leading-none font-bold">+</span> Add card
          </button>
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
  onRemove,
  onDelete,
}: {
  card: Card;
  onTap: () => void;
  onRemove: () => void;
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
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <CardTile card={card} onTap={onTap} onRemove={onRemove} onDelete={onDelete} />
    </div>
  );
}

// ── CardTile ───────────────────────────────────────────────────
function CardTile({
  card,
  onTap,
  onRemove,
  onDelete,
  isOverlay,
}: {
  card: Card;
  onTap?: () => void;
  onRemove?: () => void;
  onDelete?: () => void;
  isOverlay?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNote      = card.sub_type === "note";
  const borderClass = isNote ? "border-l-gray-200" : (TYPE_BORDER[card.type] ?? "border-l-gray-300");
  const textClass   = TYPE_TEXT[card.type] ?? "text-gray-500";
  const subLabel    = card.sub_type ? (SUB_LABEL[card.sub_type] ?? card.sub_type) : null;
  const noteSnippet = isNote ? ((card.details as Record<string, unknown>)?.notes as string | undefined) : undefined;

  const timeRange = (() => {
    const s = fmt12(card.start_time);
    const e = fmt12(card.end_time);
    if (s && e) return `${s} – ${e}`;
    return s || null;
  })();

  return (
    <div
      className={`group relative bg-white rounded-xl border border-gray-100 shadow-card mb-2 select-none overflow-hidden ${
        card.cover_image_url ? "" : `border-l-[3px] ${borderClass}`
      } ${isOverlay ? "shadow-[0_8px_24px_0_rgba(0,0,0,0.14)] scale-[1.02]" : ""}`}
    >
      <button
        onClick={onTap}
        className="w-full text-left"
      >
        {/* Cover photo */}
        {card.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.cover_image_url}
            alt=""
            className="w-full h-[120px] object-cover"
            draggable={false}
          />
        )}
        <div className="px-3 py-2.5 pr-8">
        <div className="flex items-start gap-2">
          {isNote && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          )}
          <p className="text-[13px] font-bold text-gray-900 leading-snug line-clamp-2">
            {card.title}
          </p>
        </div>
        {isNote && noteSnippet ? (
          <p className="text-[11px] text-gray-400 mt-1 leading-snug line-clamp-2">{noteSnippet}</p>
        ) : (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {timeRange && (
              <span className={`text-[10px] font-semibold ${textClass}`}>{timeRange}</span>
            )}
            {subLabel && !isNote && (
              <span className="text-[10px] text-gray-400">{subLabel}</span>
            )}
          </div>
        )}
        </div>{/* end px-3 py-2.5 pr-8 */}
      </button>

      {/* Hover trash button — desktop only, appears on group-hover */}
      {!isOverlay && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(true); setConfirmDelete(true); }}
          className="hidden md:flex absolute top-2 right-9 opacity-0 group-hover:opacity-100 w-6 h-6 items-center justify-center rounded-full bg-white border border-gray-100 shadow-sm hover:bg-red-50 hover:border-red-200 transition-all text-gray-400 hover:text-red-500"
          aria-label="Delete card"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}

      {/* ··· menu */}
      <div className="absolute top-2 right-2">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          aria-label="Card options"
        >
          <span className="text-[10px] font-black leading-none tracking-widest">···</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => { setMenuOpen(false); setConfirmDelete(false); }} />
            <div className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-sheet border border-gray-100 py-1 min-w-[180px]">
              {confirmDelete ? (
                <div className="px-4 py-3">
                  <p className="text-[12px] text-gray-600 mb-2.5 font-medium">Delete this card?</p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        setConfirmDelete(false);
                        onDelete?.();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRemove?.(); }}
                  >
                    Remove from itinerary
                  </button>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  >
                    Delete card
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
