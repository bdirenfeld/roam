import { useState } from "react";
import AddPlaceRow from "@/components/ui/AddPlaceRow";
import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";

// No drag here any more. Timed cards sort by the clock; an untimed card gets
// its place by being given a time (tap the chip). Dragging untimed cards
// among themselves was the one thing the ≡ handle could do, and dragging one
// up into the timed cards silently snapped it back — a second door to a
// worse version of the chip (Brennan, Sep 2026: "I don't understand why we
// need the gesture at all anymore").

interface Props {
  dayWithCards: DayWithCards;
  /** Omit (guest read-only) to render cards as non-interactive surfaces. */
  onCardTap?: (card: Card) => void;
  highlightedCardId?: string | null;
  onGapTap?: (gapStartTime: string, gapEndTime: string) => void;
  /** Opens the "Add from saved" picker for this day (owner only). */
  onAddFromSaved?: () => void;
  onToggleConfirmed?: (cardId: string) => void;
  /** Numbered-pin index per card, keyed by card id. */
  cardNumberById?: Map<string, number>;
  /** Guest read-only — suppress the tappable gap connector's add affordance. */
  readOnly?: boolean;
  /** Tap on a card's time chip: open the quick time sheet for it. */
  onTimeTap?: (card: Card) => void;
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

/**
 * The free time between two entries — a quiet line hanging in the same rail
 * as the times. Tap it to add something into the gap.
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
      <span className="w-[62px] md:w-[74px] shrink-0" />
      <span
        className="text-[11px] md:text-[11.5px] italic"
        style={{ color: pressed ? "#B0541F" : "rgba(26,26,46,0.28)" }}
      >
        {gapLabel(minutes)} · add
      </span>
    </button>
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
  onTimeTap,
}: Props) {
  const { cards } = dayWithCards;

  // DayViewClient's sort already puts every untimed card after every timed
  // one, so this split is contiguous.
  const timedCards = cards.filter((c) => c.start_time);
  const untimedCards = cards.filter((c) => !c.start_time);

  const surface = (card: Card) => (
    <CardSurface
      card={card}
      dayDate={dayWithCards.date}
      onTap={onCardTap ? () => onCardTap(card) : undefined}
      isHighlighted={highlightedCardId === card.id}
      onToggleConfirmed={onToggleConfirmed ? () => onToggleConfirmed(card.id) : undefined}
      pinIndex={cardNumberById?.get(card.id)}
      onTimeTap={onTimeTap ? () => onTimeTap(card) : undefined}
    />
  );

  // One line, in the page's own voice: "Add a place". The second link only
  // survives for a host that offers no search.
  const renderAddControls = (row: boolean) =>
    !readOnly && (onAddFromSaved || onGapTap) ? (
      <div className={`w-full pt-2 ${row ? "md:ml-[94px]" : ""}`}>
        {onGapTap && <AddPlaceRow onClick={() => onGapTap("", "")} centered={!row} />}
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
              <div key={card.id} data-card-id={card.id}>
                {surface(card)}
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

          {/* Untimed cards sit last. One quiet line in the same voice as
              "1h free · add" says why, and what to do about it. */}
          {untimedCards.length > 0 && timedCards.length > 0 && (
            <p
              className="mb-2 pl-[33px] text-[12.5px]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", color: "rgba(26,26,46,0.45)" }}
            >
              {readOnly ? "No time yet" : "No time yet · tap the chip to set one"}
            </p>
          )}

          {untimedCards.map((card) => (
            <div key={card.id} data-card-id={card.id}>
              {surface(card)}
            </div>
          ))}

          {/* Always-available add — the gap connector only appears between
              timed cards ≥30 min apart, so untimed days need this. */}
          {renderAddControls(true)}
        </div>
      )}
    </div>
  );
}
