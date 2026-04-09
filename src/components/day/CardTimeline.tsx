import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";

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
  if (minutes < 60) return `Free · ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `Free · ${h}h ${m}m` : `Free · ${h}h`;
}

export default function CardTimeline({ dayWithCards, onCardTap, highlightedCardId, onGapTap }: Props) {
  const { cards } = dayWithCards;

  return (
    <div className="pb-8">

      {cards.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
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
            const gap =
              index < cards.length - 1
                ? minutesBetween(card.end_time, cards[index + 1].start_time)
                : 0;

            return (
              <div key={card.id} data-card-id={card.id} className="mb-5">
                <CardSurface
                  card={card}
                  onTap={() => onCardTap(card)}
                  isHighlighted={highlightedCardId === card.id}
                />

                {gap >= 30 && (
                  <button
                    onClick={() => onGapTap?.(card.end_time ?? "")}
                    className="w-full mt-4 text-left"
                    aria-label={`Add activity — ${freeTimeLabel(gap)}`}
                  >
                    <div className="rounded-lg border border-[#E5E0D8] bg-[#FAF7F2] px-4 py-3">
                      <p className="text-sm italic text-gray-400">{freeTimeLabel(gap)}</p>
                    </div>
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
