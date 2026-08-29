import { useState } from "react";
import { BookmarkSimple, DotsSixVertical } from "@phosphor-icons/react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";

interface Props {
  dayWithCards: DayWithCards;
  /** Omit (guest read-only) to render cards as non-interactive surfaces. */
  onCardTap?: (card: Card) => void;
  highlightedCardId?: string | null;
  onGapTap?: (gapStartTime: string, gapEndTime: string) => void;
  /** Opens the "Add from saved" picker for this day (owner only). */
  onAddFromSaved?: () => void;
  onToggleConfirmed?: (cardId: string) => void;
  /** Numbered-pin index per card, keyed by card id. Used at md:+ only;
   *  omit entries (or pass an empty map) to render rows without a pin number. */
  cardNumberById?: Map<string, number>;
  /** Guest read-only — suppress the tappable gap connector's add affordance. */
  readOnly?: boolean;
  /** Persist a new order for the day's UNTIMED cards (ids, top to bottom).
   *  Timed cards are ordered by their times, so only these are draggable. */
  onReorder?: (orderedUntimedIds: string[]) => void;
}

function minutesBetween(end: string | null, start: string | null): number {
  if (!end || !start) return 0;
  const [eh, em] = end.split(":").map(Number);
  const [sh, sm] = start.split(":").map(Number);
  return sh * 60 + sm - (eh * 60 + em);
}

function gapLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m free`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m free` : `${h}h free`;
}

// Tappable timeline connector between activity cards.
// Left column is 33px — matches icon center (3px border + 12px p-3 + 18px half of w-9).
// Pressed state managed locally so each gap row is independent.
function GapRow({ minutes, onTap }: { minutes: number; onTap: () => void }) {
  const [pressed, setPressed] = useState(false);
  const lineHeight = minutes < 120 ? 36 : 56;

  return (
    <button
      onClick={onTap}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className="w-full mt-4 flex items-center py-[6px] rounded-lg"
      style={{ backgroundColor: pressed ? "rgba(196,98,45,0.05)" : undefined }}
      aria-label={`Add to this gap — ${gapLabel(minutes)}`}
    >
      {/* Dotted vertical spine — right-aligned in a 33px column to sit on the icon axis */}
      <div className="w-[33px] flex-shrink-0 flex justify-end">
        <div
          style={{
            width: "1px",
            height: `${lineHeight}px`,
            backgroundImage: pressed
              ? "linear-gradient(to bottom, rgba(196,98,45,0.55) 50%, transparent 50%)"
              : "linear-gradient(to bottom, rgba(26,26,46,0.22) 50%, transparent 50%)",
            backgroundSize: "1px 5px",
            backgroundRepeat: "repeat-y",
          }}
        />
      </div>

      {/* Label row: duration on left, add affordance on right */}
      <div className="flex-1 flex items-center justify-between px-[11px]">
        <span
          className={`text-[11px] italic font-normal leading-none ${
            pressed ? "text-activity/70" : "text-activity/50"
          }`}
        >
          {gapLabel(minutes)}
        </span>
        <span
          className={`flex items-center gap-[5px] ${
            pressed ? "text-[#C4622D] font-medium" : "text-activity/[0.45]"
          }`}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={pressed ? 2.5 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-[10px]">Add</span>
        </span>
      </div>
    </button>
  );
}

// A draggable untimed row. The drag listeners live on the grip alone so the
// card itself stays tappable — a long-press-anywhere drag would fight both
// the card tap and the day view's horizontal swipe navigation.
function SortableUntimedRow({
  card,
  children,
}: {
  card: Card;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  // Grip sits BESIDE the card, not over it — the card's own chevron already
  // occupies its right edge.
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-0.5"
    >
      <div className="flex-1 min-w-0">{children}</div>
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 self-center mb-5 p-1.5 text-activity/20 hover:text-activity/45 touch-none cursor-grab active:cursor-grabbing"
        aria-label={`Reorder ${(card.place?.title ?? (card.details as { title?: string })?.title) ?? "card"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <DotsSixVertical size={15} weight="bold" />
      </button>
    </div>
  );
}

export default function CardTimeline({
  dayWithCards,
  onCardTap,
  highlightedCardId,
  onGapTap,
  onAddFromSaved,
  onToggleConfirmed,
  cardNumberById,
  readOnly = false,
  onReorder,
}: Props) {
  const { cards } = dayWithCards;

  // Timed cards are ordered by the clock; untimed ones have no natural order,
  // so those are the ones worth dragging. (DayViewClient's sort already puts
  // every untimed card after every timed one, so this split is contiguous.)
  const timedCards = cards.filter((c) => c.start_time);
  const untimedCards = cards.filter((c) => !c.start_time);
  const canReorder = !readOnly && !!onReorder && untimedCards.length > 1;

  const sensors = useSensors(
    // Touch: hold briefly before dragging, so a tap stays a tap and a swipe
    // across the screen still changes days.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = untimedCards.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(ids, from, to));
  };

  // Shared add controls — "Add from saved" reads first, blank card second.
  // Mirrors the Plan board's column footer so both views teach the same doors.
  // `row` lays them side by side (desktop footer); stacked reads better on
  // mobile and in the narrow empty state.
  const renderAddControls = (row: boolean) =>
    !readOnly && (onAddFromSaved || onGapTap) ? (
      <div className={`flex flex-col gap-2 ${row ? "md:flex-row md:max-w-[520px] md:ml-[42px]" : ""}`}>
        {onAddFromSaved && (
          <button
            onClick={onAddFromSaved}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 active:opacity-70 transition-opacity md:flex-1"
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
        )}
        {onGapTap && (
          <button
            onClick={() => onGapTap("", "")}
            className="w-full py-3 rounded-xl border border-dashed border-gray-200 text-[12px] italic text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors md:flex-1"
          >
            + Add to this day
          </button>
        )}
      </div>
    ) : null;

  return (
    <div className="pb-8">
      {cards.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D1D5DB"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-500">Nothing planned yet</p>
          <div className="mt-6 w-full max-w-[320px]">{renderAddControls(false)}</div>
        </div>
      ) : (
        <div>
          {timedCards.map((card, index) => {
            const nextCard = timedCards[index + 1];
            const gap = nextCard ? minutesBetween(card.end_time, nextCard.start_time) : 0;

            return (
              <div key={card.id} data-card-id={card.id} className="mb-5">
                <CardSurface
                  card={card}
                  dayDate={dayWithCards.date}
                  onTap={onCardTap ? () => onCardTap(card) : undefined}
                  isHighlighted={highlightedCardId === card.id}
                  onToggleConfirmed={
                    onToggleConfirmed ? () => onToggleConfirmed(card.id) : undefined
                  }
                  pinIndex={cardNumberById?.get(card.id)}
                />
                {gap >= 30 && !readOnly && (
                  <GapRow
                    minutes={gap}
                    onTap={() =>
                      onGapTap?.(card.end_time ?? "", nextCard.start_time ?? "")
                    }
                  />
                )}
              </div>
            );
          })}

          {/* Untimed cards — draggable among themselves. The quiet divider
              explains why they sit last and why only these have a grip. */}
          {untimedCards.length > 0 && timedCards.length > 0 && (
            <div className="flex items-center gap-2 mb-3 pl-[33px]">
              <span className="text-[10px] uppercase tracking-[0.1em] text-activity/35">
                Anytime
              </span>
              <span className="flex-1 h-px bg-[rgba(26,26,46,0.07)]" />
            </div>
          )}

          {canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={untimedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {untimedCards.map((card) => (
                  <SortableUntimedRow key={card.id} card={card}>
                    <div data-card-id={card.id} className="mb-5">
                      <CardSurface
                        card={card}
                        dayDate={dayWithCards.date}
                        onTap={onCardTap ? () => onCardTap(card) : undefined}
                        isHighlighted={highlightedCardId === card.id}
                        onToggleConfirmed={
                          onToggleConfirmed ? () => onToggleConfirmed(card.id) : undefined
                        }
                        pinIndex={cardNumberById?.get(card.id)}
                      />
                    </div>
                  </SortableUntimedRow>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            untimedCards.map((card) => (
              <div key={card.id} data-card-id={card.id} className="mb-5">
                <CardSurface
                  card={card}
                  dayDate={dayWithCards.date}
                  onTap={onCardTap ? () => onCardTap(card) : undefined}
                  isHighlighted={highlightedCardId === card.id}
                  onToggleConfirmed={
                    onToggleConfirmed ? () => onToggleConfirmed(card.id) : undefined
                  }
                  pinIndex={cardNumberById?.get(card.id)}
                />
              </div>
            ))
          )}
          {/* Always-available add — the gap connector only appears between
              timed cards ≥30 min apart, so untimed days need these. */}
          {renderAddControls(true)}
        </div>
      )}
    </div>
  );
}
