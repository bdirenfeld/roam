import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";

interface Props {
  dayWithCards: DayWithCards;
  onCardTap: (card: Card) => void;
}

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function minutesBetween(end: string | null, start: string | null): number {
  if (!end || !start) return 0;
  const [eh, em] = end.split(":").map(Number);
  const [sh, sm] = start.split(":").map(Number);
  return sh * 60 + sm - (eh * 60 + em);
}

function freeTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m free`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m free` : `${h}h free`;
}

const NARRATIVE_LABELS: Record<string, string> = {
  intro:       "Arrival day",
  rising:      "Getting into it",
  climax:      "Peak day",
  denouement:  "Winding down",
  departure:   "Departure day",
};

export default function CardTimeline({ dayWithCards, onCardTap }: Props) {
  const { cards, day_number, day_name, date, narrative_position } = dayWithCards;

  const narrativeLabel = narrative_position
    ? NARRATIVE_LABELS[narrative_position]
    : null;

  const fullDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="pb-8">
      {/* Compact day header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Day {day_number} · {day_name}
          </span>
          <p className="text-sm font-bold text-gray-900 mt-0.5">{fullDate}</p>
        </div>
        {narrativeLabel && (
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 px-2 py-1 rounded-full">
            {narrativeLabel}
          </span>
        )}
      </div>

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
              <div key={card.id}>
                <div className="mb-2">
                  <CardSurface
                    card={card}
                    onTap={() => onCardTap(card)}
                    timeLabel={formatTime(card.start_time)}
                  />
                </div>

                {gap >= 30 && (
                  <div className="flex items-center gap-2.5 my-1.5 px-2">
                    <div className="flex-1 h-px bg-gray-100" />
                    <div className="flex items-center gap-1 text-[10px] text-gray-300 font-medium">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {freeTimeLabel(gap)}
                    </div>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
