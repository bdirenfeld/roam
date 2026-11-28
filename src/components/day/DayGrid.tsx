"use client";

/**
 * The phone day laid out like Outlook (28 Nov 2026, Brennan; clickable mock approved:
 * https://claude.ai/artifact/LbFYCDN84q6wCu3xMMHhHL). Hours down the side, a faint dashed line
 * at each half hour, each card a block as tall as it lasts, empty time left empty (no "free"
 * labels: "it just needs to not show anything"), overlaps side by side. Every block carries its
 * map pin's number, like the list. Booked blocks are solid; the rest are outlined, Outlook's way
 * of showing tentative (a check on the right "looks awkward").
 */
import type { Card } from "@/types/database";
import { layoutDay, hourLabel } from "@/lib/day/dayGrid";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { cardTitle } from "@/lib/cardTitle";
import { isTravelLeg, legTitle, legSubtitle } from "@/lib/travel/leg";
import { streetAndTown } from "@/lib/week/cardText";
import { noteLead } from "@/lib/noteLead";

/** One hour's height (the mock's 40 px: a whole day fits under the map). */
const HOUR = 40;
/** The time rail's width, labels included. */
const RAIL = 52;
/** A block shorter than this shows its name only. */
const TWO_LINES = 46;
const INK = "#1A1A2E";

function subLine(card: Card): string | null {
  const det = (card.details ?? {}) as Record<string, unknown>;
  if (isTravelLeg(card)) return legSubtitle(card);
  const from = typeof det.origin_airport === "string" ? det.origin_airport : null;
  const to = typeof det.arriving_at === "string" ? det.arriving_at : null;
  if (from && to) return `${from} → ${to}`;
  if (card.place) return streetAndTown(card.place.address) || null;
  return noteLead(typeof det.notes === "string" ? det.notes : null);
}

export default function DayGrid({ cards, cardNumberById, onCardTap }: {
  cards: Card[];
  cardNumberById?: Map<string, number>;
  /** Omit (guest read-only) to draw the blocks as plain surfaces. */
  onCardTap?: (card: Card) => void;
}) {
  const grid = layoutDay(cards);
  const hours: number[] = [];
  for (let h = grid.fromHour; h <= grid.toHour; h++) hours.push(h);
  const top = (m: number) => (m / 60 - grid.fromHour) * HOUR;

  return (
    <div data-testid="day-grid" className="relative mt-2 mb-4" style={{ height: (grid.toHour - grid.fromHour) * HOUR + 6 }}>
      {hours.map((h) => (
        <div key={h} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: (h - grid.fromHour) * HOUR }}>
          <span className="text-right text-[11px] font-medium tabular-nums" style={{ width: RAIL - 8, color: "rgba(26,26,46,0.42)", transform: "translateY(-1px)" }}>{hourLabel(h)}</span>
          <span className="flex-1 h-px" style={{ background: "rgba(26,26,46,0.09)" }} />
        </div>
      ))}
      {hours.slice(0, -1).map((h) => (
        <div key={`half-${h}`} aria-hidden="true" className="absolute right-0" style={{ left: RAIL - 4, top: (h - grid.fromHour + 0.5) * HOUR, borderTop: "1px dashed rgba(26,26,46,0.07)" }} />
      ))}
      {grid.items.map(({ card, start, end, col, of }) => {
        const y = top(start);
        const height = Math.max(top(end) - y, 19);
        const short = height < TWO_LINES;
        const booked = card.confirmed === true;
        const num = cardNumberById?.get(card.id);
        const title = isTravelLeg(card) ? legTitle(card) : cardTitle(card);
        const sub = short ? null : subLine(card);
        const Tag = (onCardTap ? "button" : "div") as "button";
        return (
          <Tag
            key={card.id}
            type={onCardTap ? "button" : undefined}
            data-testid="day-grid-block"
            data-card-id={card.id}
            data-booked={booked ? "1" : "0"}
            onClick={onCardTap ? () => onCardTap(card) : undefined}
            className={`absolute text-left overflow-hidden rounded-[9px] flex ${short ? "items-center px-2" : "flex-col gap-px pt-[5px] pb-[5px] pl-2.5 pr-2"} active:brightness-95`}
            style={{
              top: y + 1, height: height - 2,
              left: `calc(${RAIL + 4}px + (100% - ${RAIL + 4}px) * ${col / of})`,
              width: `calc((100% - ${RAIL + 4}px) / ${of} - ${of > 1 ? 3 : 0}px)`,
              background: booked ? "#F1F0EC" : "#FFFFFF",
              boxShadow: booked ? "inset 3px 0 0 rgba(26,26,46,0.18)" : "inset 0 0 0 1.5px rgba(26,26,46,0.16)",
              color: INK,
            }}
          >
            <span className="flex items-center gap-[5px] min-w-0 text-[12.5px]" style={{ fontWeight: booked ? 600 : 500 }}>
              <span
                aria-hidden="true"
                className="flex-none"
                style={{ color: "rgba(26,26,46,0.45)" }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(card.place?.sub_type ?? null, 15) }}
              />
              {num != null && <span className="flex-none font-medium" style={{ color: "rgba(26,26,46,0.55)" }}>{num} ·</span>}
              <span className="truncate">{title}</span>
            </span>
            {sub && <span className="truncate text-[11.5px] pl-5" style={{ color: "rgba(26,26,46,0.6)" }}>{sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
