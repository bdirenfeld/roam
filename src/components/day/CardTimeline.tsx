import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";
import { CalendarBlank, Clock } from "@phosphor-icons/react";

interface Props {
  dayWithCards: DayWithCards;
  onCardTap: (card: Card) => void;
  highlightedCardId?: string | null;
  onGapTap?: (gapStartTime: string) => void;
}

function minutesBetween(end: string | null, start: string | null): number {
  if (!end || !start) return 0;
  const [eh, em] = end.split(":").map(Number);
  const [sh, sm] = start.split(":").map(Number);
  return sh * 60 + sm - (eh * 60 + em);
}

function freeTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min free`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m free` : `${h}h free`;
}

export default function CardTimeline({ dayWithCards, onCardTap, highlightedCardId, onGapTap }: Props) {
  const { cards } = dayWithCards;

  return (
    <div className="pb-8">

      {cards.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
            <CalendarBlank size={20} weight="light" color="#D1D5DB" />
          </div>
          <p className="text-sm font-semibold text-gray-500">Nothing planned yet</p>
          <p className="text-xs text-gray-400 mt-1">Free day — enjoy the spontaneity.</p>
        </div>
      ) : (
        <div>
          {cards.map((card, index) => {
            const gap =
              index < cards.length - 1
                ? minutesBetween(card.end_time, cards[index + 1].start_time)
                : 0;

            return (
              <div key={card.id} data-card-id={card.id}>
                <div className="mb-2">
                  <CardSurface
                    card={card}
                    onTap={() => onCardTap(card)}
                    isHighlighted={highlightedCardId === card.id}
                  />
                </div>

                {gap >= 30 && (
                  <button
                    onClick={() => onGapTap?.(card.end_time ?? "")}
                    className="w-full flex items-center gap-2.5 my-1 px-1 min-h-[32px] group"
                    aria-label={`Add activity — ${freeTimeLabel(gap)}`}
                  >
                    <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-gray-300 transition-colors" />
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-400 font-medium whitespace-nowrap group-hover:text-gray-600 transition-colors">
                      <Clock size={11} weight="light" />
                      {freeTimeLabel(gap)}
                    </div>
                    <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-gray-300 transition-colors" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
