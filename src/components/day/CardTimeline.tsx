import { useState } from "react";
import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";

interface Props {
  dayWithCards: DayWithCards;
  onCardTap: (card: Card) => void;
  highlightedCardId?: string | null;
  onGapTap?: (gapStartTime: string, gapEndTime: string) => void;
  onToggleConfirmed?: (cardId: string) => void;
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

export default function CardTimeline({
  dayWithCards,
  onCardTap,
  highlightedCardId,
  onGapTap,
  onToggleConfirmed,
}: Props) {
  const { cards } = dayWithCards;

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
          <p className="text-xs text-gray-400 mt-1">Free day — enjoy the spontaneity.</p>
        </div>
      ) : (
        <div>
          {cards.map((card, index) => {
            const nextCard = cards[index + 1];
            const gap = nextCard ? minutesBetween(card.end_time, nextCard.start_time) : 0;

            return (
              <div key={card.id} data-card-id={card.id} className="mb-5">
                <CardSurface
                  card={card}
                  onTap={() => onCardTap(card)}
                  isHighlighted={highlightedCardId === card.id}
                  onToggleConfirmed={
                    onToggleConfirmed ? () => onToggleConfirmed(card.id) : undefined
                  }
                />
                {gap >= 30 && (
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
        </div>
      )}
    </div>
  );
}
