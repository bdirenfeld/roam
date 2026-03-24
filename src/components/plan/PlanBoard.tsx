"use client";

import { useState, useCallback, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import AppHeader from "@/components/ui/AppHeader";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import type { Trip, Card, DayWithCards, CardType } from "@/types/database";

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
};

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
  userAvatarUrl?: string | null;
}

export default function PlanBoard({ trip, initialDays, userAvatarUrl }: Props) {
  const supabase = createClient();
  const [days, setDays] = useState<DayWithCards[]>(initialDays);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Ref gives handleDragEnd access to the latest days without stale closure issues
  const daysRef = useRef(days);
  daysRef.current = days;

  const preDragSnapshot = useRef<DayWithCards[] | null>(null);
  const crossColumnMoved = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates as KeyboardCoordinateGetter,
    })
  );

  // ── Helpers ──────────────────────────────────────────────────
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
          supabase
            .from("cards")
            .update({ day_id: u.day_id, position: u.position })
            .eq("id", u.id)
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

    // Same-column reorder — cross-column already handled by onDragOver
    if (!wasCross && !overId.startsWith(COL_PREFIX) && activeId !== overId) {
      const dayIdx = finalDays.findIndex((d) => d.cards.some((c) => c.id === activeId));
      if (dayIdx >= 0 && finalDays[dayIdx].cards.some((c) => c.id === overId)) {
        const oldIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === activeId);
        const newIdx = finalDays[dayIdx].cards.findIndex((c) => c.id === overId);
        if (oldIdx !== newIdx) {
          finalDays = finalDays.map((d, i) =>
            i === dayIdx
              ? { ...d, cards: arrayMove(d.cards, oldIdx, newIdx) }
              : d
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

  // ── Card edits from detail sheet ──────────────────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === updated.id ? updated : c)),
      }))
    );
    setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  // ── Remove from itinerary ─────────────────────────────────────
  const handleRemove = useCallback(async (cardId: string) => {
    setDays((prev) =>
      prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }))
    );
    await supabase.from("cards").update({ status: "interested" }).eq("id", cardId);
  }, [supabase]);

  // ── Add card ──────────────────────────────────────────────────
  const handleAddCard = useCallback(async (dayId: string, title: string) => {
    const dayCards = daysRef.current.find((d) => d.id === dayId)?.cards ?? [];
    const maxPos   = dayCards.reduce((m, c) => Math.max(m, c.position), 0);
    const newCard: Card = {
      id: crypto.randomUUID(),
      day_id: dayId,
      trip_id: trip.id,
      type: "activity",
      sub_type: "self_directed",
      title,
      start_time: null,
      end_time:   null,
      position: maxPos + 1,
      status: "in_itinerary",
      source_url: null,
      cover_image_url: null,
      lat: null,
      lng: null,
      address: null,
      details: {},
      ai_generated: false,
      created_at: new Date().toISOString(),
    };
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId ? { ...d, cards: [...d.cards, newCard] } : d
      )
    );
    const { error } = await supabase.from("cards").insert({
      id: newCard.id,
      day_id: dayId,
      trip_id: trip.id,
      type: "activity",
      sub_type: "self_directed",
      title,
      position: maxPos + 1,
      status: "in_itinerary",
      details: {},
    });
    if (error) {
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId
            ? { ...d, cards: d.cards.filter((c) => c.id !== newCard.id) }
            : d
        )
      );
    }
  }, [supabase, trip.id]);

  const firstDay = initialDays[0];
  const activeCard = activeId ? findCard(activeId) : null;

  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      <AppHeader subtitle={trip.title} avatarUrl={userAvatarUrl} />

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
        <span className="text-xs font-bold text-gray-400 ml-1">Plan</span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col md:flex-row gap-4 p-4 pb-28 md:pb-6 md:min-w-max">
            {days.map((day) => (
              <DayColumn
                key={day.id}
                day={day}
                cards={day.cards}
                onCardTap={(card) => setSelectedCard(card)}
                onRemove={handleRemove}
                onAddCard={(title) => handleAddCard(day.id, title)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard && <CardTile card={activeCard} isOverlay />}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={handleCardUpdate}
        />
      )}
    </div>
  );
}

// ── DayColumn ──────────────────────────────────────────────────
interface DayColumnProps {
  day: DayWithCards;
  cards: Card[];
  onCardTap: (card: Card) => void;
  onRemove: (cardId: string) => void;
  onAddCard: (title: string) => void;
}

function DayColumn({ day, cards, onCardTap, onRemove, onAddCard }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${day.id}` });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const commitAdd = () => {
    const t = newTitle.trim();
    setAdding(false);
    setNewTitle("");
    if (t) onAddCard(t);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { e.preventDefault(); commitAdd(); }
    if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
  };

  return (
    <div className="flex flex-col w-full md:w-72 md:flex-shrink-0">
      {/* Column header */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-gray-800">Day {day.day_number}</span>
          {day.date && (
            <>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-500 font-medium">{fmtDate(day.date)}</span>
            </>
          )}
        </div>
        {day.day_name && (
          <p className="text-xs font-semibold text-gray-700 mt-0.5">{day.day_name}</p>
        )}
        {day.narrative_position && (
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
            {day.narrative_position}
          </p>
        )}
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[72px] rounded-xl transition-colors ${
          isOver && cards.length === 0 ? "bg-gray-100" : ""
        }`}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCardTile
              key={card.id}
              card={card}
              onTap={() => onCardTap(card)}
              onRemove={() => onRemove(card.id)}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && !isOver && (
          <div className="h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
            <p className="text-xs text-gray-300">Drop cards here</p>
          </div>
        )}
      </div>

      {/* Add card */}
      <div className="mt-2">
        {adding ? (
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={handleKey}
            placeholder="Card title…"
            className="w-full text-sm text-gray-800 bg-white rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-activity placeholder:text-gray-300"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 py-2 transition-colors"
          >
            <span className="text-base leading-none font-bold">+</span> Add card
          </button>
        )}
      </div>
    </div>
  );
}

// ── SortableCardTile ───────────────────────────────────────────
function SortableCardTile({
  card,
  onTap,
  onRemove,
}: {
  card: Card;
  onTap: () => void;
  onRemove: () => void;
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
      <CardTile card={card} onTap={onTap} onRemove={onRemove} />
    </div>
  );
}

// ── CardTile ───────────────────────────────────────────────────
function CardTile({
  card,
  onTap,
  onRemove,
  isOverlay,
}: {
  card: Card;
  onTap?: () => void;
  onRemove?: () => void;
  isOverlay?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const borderClass = TYPE_BORDER[card.type] ?? "border-l-gray-300";
  const textClass   = TYPE_TEXT[card.type]   ?? "text-gray-500";
  const subLabel    = card.sub_type ? (SUB_LABEL[card.sub_type] ?? card.sub_type) : null;

  const timeRange = (() => {
    const s = fmt12(card.start_time);
    const e = fmt12(card.end_time);
    if (s && e) return `${s} – ${e}`;
    return s || null;
  })();

  return (
    <div
      className={`relative bg-white rounded-xl border border-gray-100 border-l-[3px] shadow-card mb-2 select-none ${borderClass} ${
        isOverlay ? "shadow-card-hover rotate-1 scale-105" : ""
      }`}
    >
      {/* Tap target — pointer events only; drag handled by outer SortableCardTile */}
      <button
        onClick={onTap}
        // Don't stopPropagation on pointerDown — let dnd-kit see it for drag tracking
        className="w-full text-left px-3 py-2.5 pr-8"
      >
        <p className="text-[13px] font-bold text-gray-900 leading-snug line-clamp-2">
          {card.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {timeRange && (
            <span className={`text-[10px] font-semibold ${textClass}`}>
              {timeRange}
            </span>
          )}
          {subLabel && (
            <span className="text-[10px] text-gray-400">{subLabel}</span>
          )}
        </div>
      </button>

      {/* ··· menu */}
      <div className="absolute top-2 right-2">
        <button
          onPointerDown={(e) => e.stopPropagation()} // don't start drag on menu tap
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          aria-label="Card options"
        >
          <span className="text-[10px] font-black leading-none tracking-widest">···</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-sheet border border-gray-100 py-1 min-w-[180px]">
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRemove?.();
                }}
              >
                Remove from itinerary
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
