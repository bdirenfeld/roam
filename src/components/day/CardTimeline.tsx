import { useState } from "react";
import AddPlaceRow from "@/components/ui/AddPlaceRow";
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
/**
 * The free time between two entries.
 *
 * Between boxed cards this was a connector and read as one — a dotted spine
 * joining two surfaces. Against hairline entries there is nothing left to
 * connect, so the spine and the framed row read as a broken record of their
 * own. It is a quiet line now, hanging in the same rail as the times.
 */
function GapRow({ minutes, onTap }: { minutes: number; onTap: () => void }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onTap}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className="w-full flex gap-3 md:gap-5 py-2"
      aria-label={`Add to this gap — ${gapLabel(minutes)}`}
    >
      <span className="w-[52px] md:w-[74px] shrink-0" />
      <span
        className="text-[11px] md:text-[11.5px] italic"
        style={{ color: pressed ? "#B0541F" : "rgba(26,26,46,0.28)" }}
      >
        {gapLabel(minutes)} · add
      </span>
    </button>
  );
}

// A draggable untimed row. The drag starts from a visible "≡" handle on the
// right: a touch there is a drag, never a scroll (touch-none) and never a
// text selection. Whole-row dragging was tried on 2026-09-05 and lost to the
// phone — the browser read the hold as "select text". The handle is the size
// and ink of the card's own glyphs so it can be found.
function SortableUntimedRow({
  card,
  children,
}: {
  card: Card;
  children: React.ReactNode;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  // `attributes` is deliberately not spread: it would put role="button" on a
  // row that already contains the card's button. touch-manipulation, not
  // touch-none: a vertical scroll must still be a scroll.
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-1"
    >
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        {...listeners}
        aria-label={`Hold to move ${(card.place?.title ?? (card.details as { title?: string })?.title) ?? "card"}`}
        title="Hold to move"
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 self-center mb-5 w-9 h-9 grid place-items-center rounded-full touch-none select-none cursor-grab active:cursor-grabbing"
        style={{ color: "rgba(26,26,46,0.45)", WebkitTouchCallout: "none" as never }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="5" y1="8" x2="19" y2="8" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="5" y1="16" x2="19" y2="16" />
        </svg>
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
      // A beige filled button and a dashed box were the last two SaaS
      // defaults on this screen. One line, in the page's own voice.
      <div className={`w-full pt-2 ${row ? "md:ml-[94px]" : ""}`}>
        {onGapTap && <AddPlaceRow onClick={() => onGapTap("", "")} centered={!row} />}
        {/* "Add from saved" is inside "Add a place" now — the one sheet lists
            saved places first. The second link only survives for a host
            that offers no search. */}
        {!onGapTap && onAddFromSaved && (
          <button
            onClick={onAddFromSaved}
            className="text-[14px]"
            style={{ color: "rgba(26,26,46,0.45)" }}
          >
            Add from saved
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
              <div key={card.id} data-card-id={card.id} className="">
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

          {/* Untimed cards — draggable among themselves. One quiet line in the
              same voice as "1h free · add" says why they sit last; the small-caps
              ANYTIME rule read as a section nobody asked for (Brennan, Sep 2026). */}
          {untimedCards.length > 0 && timedCards.length > 0 && (
            <p
              className="mb-2 pl-[33px] text-[12.5px]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", color: "rgba(26,26,46,0.45)" }}
            >
              No time yet · hold ≡ to move
            </p>
          )}

          {canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={untimedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {untimedCards.map((card) => (
                  <SortableUntimedRow key={card.id} card={card}>
                    <div data-card-id={card.id} className="">
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
              <div key={card.id} data-card-id={card.id} className="">
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
