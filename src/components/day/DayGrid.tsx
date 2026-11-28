"use client";

/**
 * The phone day laid out like Outlook (28 Nov 2026, Brennan; clickable mock approved:
 * https://claude.ai/artifact/LbFYCDN84q6wCu3xMMHhHL).
 *
 * Round 2, the same day ("This looks super cluttered. Has Outlook kind of solved this?"):
 * filled blocks with no outlines, small quiet text, the address only on a long block, and
 * travel as a slim dashed strip rather than a box — the way Outlook and Google Calendar keep a
 * busy day calm. He kept the icon and the map pin's number on every block ("I still think you
 * need the numbers and the icon"). Empty time stays empty: no "free" labels. Booked blocks are a
 * shade deeper with a slim bar; the rest a pale fill.
 */
import type { Card } from "@/types/database";
import { layoutDay, hourLabel } from "@/lib/day/dayGrid";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { cardTitle } from "@/lib/cardTitle";
import { isTravelLeg, legTitle, legSubtitle, iconSubType, legModeWord } from "@/lib/travel/leg";
import { streetAndTown } from "@/lib/week/cardText";
import { noteLead } from "@/lib/noteLead";

/** One hour's height (the mock's 40 px). */
const HOUR = 40;
/** The time rail's width, labels included. */
const RAIL = 52;
/** A block this tall (90 min) or more shows where under its name. */
const TWO_LINES = 60;
const INK = "#1A1A2E";

/** A run of travel legs, as the list joins them ("Leave for Florence", "Back to Villa"). */
export interface GridTravel { cards: Card[]; startMin: number; endMin: number | null; dest: string; leave: boolean }

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

function subLine(card: Card): string | null {
  const det = (card.details ?? {}) as Record<string, unknown>;
  if (isTravelLeg(card)) return legSubtitle(card);
  const from = typeof det.origin_airport === "string" ? det.origin_airport : null;
  const to = typeof det.arriving_at === "string" ? det.arriving_at : null;
  if (from && to) return `${from} → ${to}`;
  if (card.place) return streetAndTown(card.place.address) || null;
  return noteLead(typeof det.notes === "string" ? det.notes : null);
}

const icon = (sub: string | null, size: number) => (
  <span
    aria-hidden="true"
    className="flex-none flex items-center"
    style={{ color: "rgba(26,26,46,0.45)" }}
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(sub, size) }}
  />
);

type Slot = { kind: "card"; card: Card } | { kind: "travel"; travel: GridTravel };

export default function DayGrid({ cards, travel = [], cardNumberById, onCardTap }: {
  cards: Card[];
  travel?: GridTravel[];
  cardNumberById?: Map<string, number>;
  /** Omit (guest read-only) to draw the blocks as plain surfaces. */
  onCardTap?: (card: Card) => void;
}) {
  // Travel runs go through the same layout as stops, as cards with the run's times.
  const slots = new Map<string, Slot>();
  const timed: (Card | (Card & { __travel: true }))[] = [];
  for (const c of cards) { slots.set(c.id, { kind: "card", card: c }); timed.push(c); }
  travel.forEach((t, i) => {
    const id = `travel-${i}`;
    slots.set(id, { kind: "travel", travel: t });
    timed.push({ ...t.cards[0], id, start_time: hhmm(t.startMin), end_time: t.endMin !== null ? hhmm(t.endMin) : null, details: {}, place: null } as unknown as Card);
  });
  const grid = layoutDay(timed);
  const hours: number[] = [];
  for (let h = grid.fromHour; h <= grid.toHour; h++) hours.push(h);
  const top = (m: number) => (m / 60 - grid.fromHour) * HOUR;
  const place = (col: number, of: number) => ({
    left: `calc(${RAIL + 4}px + (100% - ${RAIL + 4}px) * ${col / of})`,
    width: `calc((100% - ${RAIL + 4}px) / ${of} - ${of > 1 ? 3 : 0}px)`,
  });

  return (
    <div data-testid="day-grid" className="relative mt-2.5 mb-4" style={{ height: (grid.toHour - grid.fromHour) * HOUR + 6 }}>
      {/* Every line sits exactly on its time, the label centred on it. */}
      {hours.map((h) => (
        <div key={h} data-testid="day-grid-hour" style={{ top: (h - grid.fromHour) * HOUR }} className="absolute left-0 right-0">
          <span className="absolute left-0 text-right text-[10.5px] font-medium tabular-nums leading-none" style={{ width: RAIL - 8, color: "rgba(26,26,46,0.38)", transform: "translateY(-50%)" }}>{hourLabel(h)}</span>
          <span className="absolute right-0 h-px" style={{ left: RAIL, background: "rgba(26,26,46,0.07)" }} />
        </div>
      ))}
      {hours.slice(0, -1).map((h) => (
        <div key={`half-${h}`} data-testid="day-grid-half" aria-hidden="true" className="absolute right-0" style={{ left: RAIL, top: (h - grid.fromHour + 0.5) * HOUR, borderTop: "1px dashed rgba(26,26,46,0.05)" }} />
      ))}
      {grid.items.map(({ card: item, start, end, col, of }) => {
        const slot = slots.get(item.id)!;
        const y = top(start);
        if (slot.kind === "travel") {
          // Travel: a slim dashed strip down the left edge, one quiet line of text.
          const t = slot.travel;
          const modes = Array.from(new Set(t.cards.map((c) => legModeWord(c.details).toLowerCase()).filter(Boolean))).join(" + ");
          const label = `${t.leave ? "Leave for" : "Back to"} ${t.dest}${modes ? ` · ${modes}` : ""}`;
          const Tag = (onCardTap ? "button" : "div") as "button";
          return (
            <Tag key={item.id} type={onCardTap ? "button" : undefined} data-testid="day-grid-travel"
              onClick={onCardTap ? () => onCardTap(t.cards[0]) : undefined}
              className="absolute text-left overflow-hidden flex items-start gap-1 pl-2.5"
              style={{ top: y + 1, height: Math.max(top(end) - y, 16) - 2, ...place(col, of), borderLeft: "2px dashed rgba(26,26,46,0.22)" }}>
              {icon(iconSubType(t.cards[0]), 13)}
              <span className="truncate text-[11px] font-medium leading-[1.3] pt-px" style={{ color: "rgba(26,26,46,0.5)" }}>{label}</span>
            </Tag>
          );
        }
        const card = slot.card;
        const height = Math.max(top(end) - y, 18);
        const two = height >= TWO_LINES;
        const booked = card.confirmed === true;
        const num = cardNumberById?.get(card.id);
        const title = isTravelLeg(card) ? legTitle(card) : cardTitle(card);
        const sub = two ? subLine(card) : null;
        const Tag = (onCardTap ? "button" : "div") as "button";
        return (
          <Tag
            key={card.id}
            type={onCardTap ? "button" : undefined}
            data-testid="day-grid-block"
            data-card-id={card.id}
            data-booked={booked ? "1" : "0"}
            onClick={onCardTap ? () => onCardTap(card) : undefined}
            className={`absolute text-left overflow-hidden rounded-[7px] flex ${two ? "flex-col gap-px pt-1 pb-1" : "items-center"} pl-2 pr-2 active:brightness-95`}
            style={{
              top: y + 1, height: height - 2, ...place(col, of),
              background: booked ? "#E7E5DE" : "#F3F2EE",
              boxShadow: booked ? "inset 3px 0 0 rgba(26,26,46,0.35)" : "none",
              color: INK,
            }}
          >
            <span className="flex items-center gap-[5px] min-w-0 text-[12px] leading-[1.3]" style={{ fontWeight: booked ? 600 : 500 }}>
              {icon(card.place?.sub_type ?? null, 14)}
              {num != null && <span className="flex-none font-medium" style={{ color: "rgba(26,26,46,0.45)" }}>{num} ·</span>}
              <span className="truncate">{title}</span>
            </span>
            {sub && <span className="truncate text-[11px] pl-[19px]" style={{ color: "rgba(26,26,46,0.55)" }}>{sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
