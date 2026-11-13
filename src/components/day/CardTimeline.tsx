import { useState } from "react";
import AddPlaceRow from "@/components/ui/AddPlaceRow";
import CardSurface from "@/components/cards/CardSurface";
import type { DayWithCards, Card } from "@/types/database";
import { dayFlow } from "@/lib/day/dayFlow";
import { isTravelLeg, legDestTitle, iconSubType } from "@/lib/travel/leg";
import { stripDuration } from "@/lib/week/travelStrip";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { formatTimeValue } from "@/lib/formatTime";

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
  /** Numbered-pin index per card, keyed by card id. */
  cardNumberById?: Map<string, number>;
  /** Guest read-only — suppress the tappable gap connector's add affordance. */
  readOnly?: boolean;
  /** Tap on a card's time chip: open the quick time sheet for it. */
  onTimeTap?: (card: Card) => void;
  /** A new journey's Start here is above (components/plan/StartHere): no "Nothing planned yet" under it. */
  quietEmpty?: boolean;
  /** The journey is under way today (local date, set in an effect by the host): an
   *  empty day reads "A free day", not "Nothing planned yet" (6 Oct 2026, delight audit). */
  underway?: boolean;
  /** Phone: "Give these times" under the untimed group runs the day-strip menu's
   *  Give these times (7 Oct 2026, taps audit). Shown at 2+ untimed places. */
  onGiveTimes?: () => void;
  /** The trip's stay names, so the way home reads "→ Villa" and "Back at the villa". */
  stays?: string[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

/**
 * Travel as one shaded line (12 Nov 2026): "🚗🚆 Leave 8:00 AM → Florence · 1 h 25".
 * A tap shows the legs underneath (each opens its card) and asks the day map
 * to zoom out to the whole route.
 */
function TravelLine({ cards, startMin, endMin, dest, leave, renderLeg }: {
  cards: Card[]; startMin: number; endMin: number | null; dest: string; leave: boolean; renderLeg: (c: Card) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const icons = Array.from(new Set(cards.map((c) => iconSubType(c))));
  return (
    <div data-travel-line="1" data-card-id={cards[0]?.id}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          window.dispatchEvent(new CustomEvent("roam:day-route", { detail: { open: !open } }));
        }}
        aria-expanded={open}
        className="w-full my-2 min-h-[46px] flex items-center gap-2 px-4 py-3 rounded-xl text-left active:opacity-80"
        style={{ background: "#F4F4F6", color: "#1A1A2E" }}
      >
        <span className="inline-flex gap-0.5 shrink-0" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icons.map((s) => getMaterialIconHTML(s, 17)).join("") }} />
        <span className="text-[15px] font-semibold whitespace-nowrap">{leave ? "Leave " : ""}{formatTimeValue(hhmm(startMin))}</span>
        <span className="text-[15px] truncate min-w-0">→ {dest}</span>
        {endMin !== null && endMin > startMin && (
          <span className="text-[13px] whitespace-nowrap" style={{ color: "rgba(26,26,46,0.55)" }}>· {stripDuration(endMin - startMin)}</span>
        )}
      </button>
      {open && <div className="mb-2 pl-3" data-testid="travel-legs">{cards.map((c) => <div key={c.id}>{renderLeg(c)}</div>)}</div>}
    </div>
  );
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
      // Phone: gone (Brennan, 24 Sep 2026: "remove the free time parts").
      // Desktop keeps the row; it is the add-at-this-time door there.
      className="w-full hidden md:flex gap-3 md:gap-5 py-2"
      aria-label={`Add to this gap — ${gapLabel(minutes)}`}
    >
      <span className="w-[62px] md:w-[74px] shrink-0" />
      <span
        className="text-[11px] md:text-[11.5px]"
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
  cardNumberById,
  readOnly = false,
  onTimeTap,
  quietEmpty = false,
  underway = false,
  onGiveTimes,
  stays = [],
}: Props) {
  const { cards } = dayWithCards;

  // DayViewClient's sort already puts every untimed card after every timed
  // one, so this split is contiguous.
  const timedCards = cards.filter((c) => c.start_time);
  const untimedCards = cards.filter((c) => !c.start_time);
  // Only cards with a place can be given a time by the arranger.
  const untimedPlaces = untimedCards.filter((c) => c.place_id || c.place).length;
  const showGiveTimes = !!onGiveTimes && !readOnly && untimedPlaces >= 2;

  const surface = (card: Card, inSection = false) => (
    <CardSurface
      card={card}
      dropTown={inSection}
      dayDate={dayWithCards.date}
      onTap={onCardTap ? () => onCardTap(card) : undefined}
      isHighlighted={highlightedCardId === card.id}
      pinIndex={cardNumberById?.get(card.id)}
      onTimeTap={onTimeTap ? () => onTimeTap(card) : undefined}
    />
  );

  // One line, in the page's own voice: "Add a place". The second link only
  // survives for a host that offers no search.
  const renderAddControls = (row: boolean) =>
    !readOnly && (onAddFromSaved || onGapTap) ? (
      <div data-walk="day-add" className={`w-full pt-2 ${row ? "md:ml-[94px]" : ""}`}>
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
        quietEmpty ? (
          <div className="w-full max-w-[320px] mx-auto">{renderAddControls(false)}</div>
        ) : <div className="flex flex-col items-center py-14 text-center">
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
          <p className="text-sm font-semibold text-gray-500">{underway ? "A free day" : "Nothing planned yet"}</p>
          {/* No saved count here or on the Add row (Brennan, 23 Sep 2026: "what
              does 20 saved actually give you? What if you have 50?"). A number
              says a pile exists, not what is in it; the answer is a list of the
              places themselves, which is the Left to place proposal. */}
          <div className="mt-6 w-full max-w-[320px]">{renderAddControls(false)}</div>
        </div>
      ) : (
        <div>
          {dayFlow(timedCards, isTravelLeg, legDestTitle, stays).map((item, i, items) => {
            if (item.kind === "travel") {
              return <TravelLine key={item.ids[0]} cards={item.cards} startMin={item.startMin} endMin={item.endMin} dest={item.dest} leave={item.leave} renderLeg={(c) => surface(c)} />;
            }
            if (item.kind === "heading") {
              return (
                <p key={`h${i}`} data-day-heading="1" className="pt-3 pb-0.5 text-[11px] uppercase" style={{ letterSpacing: "0.12em", color: "rgba(26,26,46,0.5)" }}>
                  {item.text}
                </p>
              );
            }
            const card = item.card;
            const index = timedCards.indexOf(card);
            const nextCard = timedCards[index + 1];
            const gap = nextCard ? minutesBetween(card.end_time, nextCard.start_time) : 0;
            const inSection = items.slice(0, i).some((x) => x.kind === "heading");

            return (
              <div key={card.id} data-card-id={card.id}>
                {surface(card, inSection)}
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
              style={{ color: "rgba(26,26,46,0.45)" }}
            >
              {/* "Any time", was "No time yet · tap the chip to set one" (6 Oct 2026, delight audit) */}
              Any time
            </p>
          )}

          {untimedCards.map((card) => (
            <div key={card.id} data-card-id={card.id}>
              {surface(card)}
            </div>
          ))}

          {/* "Give these times" (7 Oct 2026, taps audit): the same Give these
              times as the day strip's long-press menu, where nobody found it.
              Phone only; desktop has it in the day header's menu. */}
          {showGiveTimes && (
            <button
              type="button"
              onClick={onGiveTimes}
              className="relative md:hidden mt-1 mb-1 ml-[33px] py-2 text-[13px] underline underline-offset-4 active:opacity-70"
              style={{ color: "rgba(26,26,46,0.55)", textDecorationColor: "rgba(26,26,46,0.25)" }}
            >
              {/* 44px tall (7 Oct 2026, phone harness): out to its own 4px margins only. */}
              <span aria-hidden="true" data-testid="give-times-target" className="absolute -inset-y-1 -inset-x-2" />
              Give these times
            </button>
          )}

          {/* Always-available add — the gap connector only appears between
              timed cards ≥30 min apart, so untimed days need this. */}
          {renderAddControls(true)}
        </div>
      )}
    </div>
  );
}
