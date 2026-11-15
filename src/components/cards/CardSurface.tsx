import type { Card } from "@/types/database";
import { noteLead } from "@/lib/noteLead";
import { getMaterialIconHTML, getGlyphHTML } from "@/lib/mapPins";
import { readNoteKind } from "@/lib/cards/noteKinds";
import { getPriceRange } from "@/lib/priceRange";
import { formatTimeRange } from "@/lib/formatTime";
import { cardTimes } from "@/lib/cardTime";
import { subTypeLabel } from "@/lib/subTypeLabel";
import { getOpeningHoursConflict, openingHoursCaption, openingHoursTone } from "@/lib/openingHours";
import LovedHeart from "@/components/ui/LovedHeart";
import CardBadges from "./CardBadges";
import { streetAndTown } from "@/lib/week/cardText";
import { UNTITLED_NOTE, cardTitle } from "@/lib/cardTitle";
import { isTravelLeg, legTitle, legSubtitle, readMode, LEG_MODE_GLYPH } from "@/lib/travel/leg";
import { dropTown } from "@/lib/day/dayFlow";
import { stripDuration } from "@/lib/week/travelStrip";

interface Props {
  card: Card;
  /** The card's day calendar date ("YYYY-MM-DD"), for the opening-hours signal. */
  dayDate?: string | null;
  /** Omit (guest read-only) to render the card as a non-interactive surface. */
  onTap?: () => void;
  isHighlighted?: boolean;
  /** Tap on the time chip (or "No time"): opens the quick time sheet. */
  onTimeTap?: () => void;
  /** The number on this card's pin in the day map. Drawn as a small ring
   *  numeral in the rail, first, with the glyph after it: the number is what
   *  you scan for, and numbers first make a straight column down the day.
   *  (It was dropped once as debris; a day with three forks on the map
   *  proved the glyph alone could not tie a row to a pin — Brennan, Sep 2026.) */
  pinIndex?: number;
  /** Under an "In Florence" heading: the address drops its town (12 Nov 2026, lib/day/dayFlow). */
  dropTown?: boolean;
}

/** Cards eligible to show a confirmation dot */

function flightRoute(det: Record<string, unknown> | null, timeRange: string | null): string | null {
  const origin   = typeof det?.origin_airport  === "string" ? det.origin_airport  : null;
  const arriving = typeof det?.arriving_at      === "string" ? det.arriving_at      : null;
  if (origin && arriving) {
    const base = `${origin} → ${arriving}`;
    return timeRange ? `${base} · ${timeRange}` : base;
  }
  return typeof det?.airline === "string" ? det.airline : null;
}

/**
 * Street and city, not the postal code and country.
 * "Piazza Franco Anelli, 70013 Castellana Grotte BA, Italy" → "Piazza Franco
 * Anelli, Castellana Grotte".
 */
const shortAddress = streetAndTown;

/** "6:00 pm" for the rail. The range still shows in the line beneath. */
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function railTime(start: string | null): string | null {
  if (!start) return null;
  const [h, m] = start.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** The leg's mode glyph, drawn the way getMaterialIconHTML draws a sub_type's (7 Oct 2026). */
function legGlyph(mode: keyof typeof LEG_MODE_GLYPH): string {
  return `<span class="material-symbols-outlined" style="font-size:20px;line-height:1;display:block;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">${LEG_MODE_GLYPH[mode]}</span>`;
}

/** The first real sentence of a note: lib/noteLead (shared with the week and the map pin, 6 Oct 2026). */
function noteLeadOf(det: Record<string, unknown> | null): string | null {
  return noteLead(typeof det?.notes === "string" ? det.notes : null);
}

/**
 * One entry in a day.
 *
 * This was a bordered, shadowed card with a grey pin icon on every row and a
 * chevron on the end — five SaaS defaults stacked up. It is a page now: the
 * time hangs in a left rail, the name is set in the display face, hairlines
 * separate rather than boxes contain, and where the place has a photograph the
 * photograph is used. The app already had those pictures and the agenda was
 * throwing them away for an identical grey placeholder.
 */
// Row E (Brennan, 24 Sep 2026): the rail is the time and nothing else. The
// pin number is not drawn on the row any more — the map pins keep it, and a
// pin tap lifts its row. `pinIndex` stays in Props so callers need not change.
export default function CardSurface({ card, dayDate, onTap, isHighlighted, onTimeTap, dropTown: inTown = false, pinIndex }: Props) {
  const place     = card.place;
  const det       = card.details as Record<string, unknown> | null;
  const subLabel  = subTypeLabel(place?.sub_type);
  const shown    = cardTimes(card);
  const timeRange = formatTimeRange(shown.start, shown.end);
  // The end time goes in too (7 Oct 2026): ending after closing reads "Closes 11:00 PM".
  const hoursSignal = place ? getOpeningHoursConflict(place.hours, dayDate ?? null, card.start_time, place.sub_type, card.end_time) : null;
  const noteSnippet = !place ? (det?.notes as string | undefined) : undefined;
  // A travel leg (7 Oct 2026, mock d13): "Lusaka → Mfuwe" in full, and
  // "Overland truck · 13h" under it — the route reads like a flight's.
  const isLeg     = isTravelLeg(card);
  const title     = isLeg ? legTitle(card) : cardTitle(card) === UNTITLED_NOTE && noteSnippet ? noteSnippet.slice(0, 60) : cardTitle(card); // "A note", was "(untitled note)" (6 Oct 2026, delight audit)

  const isFlight = place?.sub_type === "flight_arrival" || place?.sub_type === "flight_departure";

  // What the entry says about itself — the same shape on every row.
  //
  // This briefly showed the notes: first the first line, then a `summary`
  // field backfilled out of that same prose. Both read inconsistently, because
  // notes aren't written to one pattern — one card describes a place, the next
  // gives instructions, and either can truncate mid-word. The row shows facts
  // instead: what kind of thing it is and where it is. The writing is still
  // there, in the card, when you open it.
  const detail = isLeg
    ? legSubtitle(card)
    : isFlight
    ? flightRoute(det, timeRange)
    : place
      ? ((inTown ? dropTown(shortAddress(place.address)) : shortAddress(place.address)) || subLabel || null)
      : noteLeadOf(det);
  // The category glyph leads the subtitle in place of the category word —
  // "🍴 Via Rosina" says what "Restaurant · Via Rosina" said, in one shape.
  // A leg with no mode shows the transit glyph, not a car (7 Oct 2026, mock t05: no guessed Drive).
  const legMode    = isLeg ? readMode(det) : null;
  // A typed note with no place yet shows its kind's glyph (10 Nov 2026).
  const noteKind   = place ? null : readNoteKind(det);
  const rowIcon = legMode ? legGlyph(legMode) : place ? getMaterialIconHTML(place.sub_type ?? null, 20) : getGlyphHTML(noteKind?.glyph ?? "edit_note", 20);

  const surfRating = place?.type === "food" ? place.rating : null;
  const isLoved    = place?.loved === true;
  const priceRange = place?.type === "food"
    ? getPriceRange(place.price_level ?? undefined, det?.currency_code as string | undefined, place.address)
    : null;

  // Through cardTimes, like everything else on this card: an arriving flight
  // is chipped at its landing time, not at when it pushed back in Toronto.
  const rail = railTime(shown.start);
  // A leg's chip shows the range, start over end: a 13-hour day on the truck
  // looks like one (7 Oct 2026, mock d13).
  // Under the time, how long it lasts (15 Nov 2026, the Outlook row): "1 h 15", "30 min".
  const mins = shown.start && shown.end ? toMin(shown.end) - toMin(shown.start) : 0;
  const length = mins > 0 ? stripDuration(mins) : null;

  const interactive = !!onTap;
  const Wrapper = (interactive ? "button" : "div") as "button";

  return (
    <Wrapper
      onClick={onTap}
      className={`w-full text-left flex items-start gap-3 md:gap-5 py-3 md:py-4 min-h-[62px] transition-colors select-none ${
        isHighlighted ? "card-highlight" : ""
      }`}
      style={{ borderBottom: "1px solid rgba(26,26,46,0.10)" }}
    >
      {/* One row, every row (Brennan, 15 Nov 2026: the list under the map had "too
          many types of shapes"; he wanted Outlook's structure). The time, bold, with
          how long it lasts under it; one grey icon; the name and one grey line. No
          photo tile, no ring around the pin number, no pill around the time. The
          time still opens the quick time sheet. */}
      <div className="w-[70px] md:w-[80px] shrink-0 flex flex-col items-start">
        {onTimeTap ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onTimeTap(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTimeTap(); } }}
            aria-label={rail ? `Change the time, now ${rail}` : "Set a time"}
            className={`relative text-[13.5px] leading-[20px] whitespace-nowrap cursor-pointer ${rail ? "uppercase" : ""}`}
            style={{ color: rail ? "#1A1A2E" : "rgba(26,26,46,0.4)", fontWeight: rail ? 600 : 400 }}
          >
            {/* A finger-sized target (44px) around a small label: a near-miss on
                Android opened the card instead (6 Oct 2026, taps audit). */}
            <span aria-hidden="true" data-testid="time-chip-target" className="absolute -inset-x-1.5 -inset-y-[13px]" />
            {rail ?? "Set time"}
          </span>
        ) : rail && (
          <span className="text-[13.5px] leading-[20px] uppercase whitespace-nowrap" style={{ color: "#1A1A2E", fontWeight: 600 }}>
            {rail}
          </span>
        )}
        {rail && length && (
          <span data-testid="row-length" className="text-[11.5px] mt-[2px]" style={{ color: "rgba(26,26,46,0.55)" }}>{length}</span>
        )}
      </div>

      <span
        data-row-icon="1"
        aria-hidden="true"
        className="w-5 h-5 shrink-0 flex items-center justify-center"
        style={{ color: "rgba(26,26,46,0.5)" }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: rowIcon }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className="min-w-0 font-display text-[15.5px] md:text-[17px] leading-[20px] truncate"
            style={{ color: "#1A1A2E" }}
          >
            {title}
          </p>
          {isLoved && <LovedHeart size={11} />}
        </div>

        {/* Two lines, no exceptions (24 Sep 2026): ONE grey line that truncates.
            The map pin's number leads it, plain (12 Nov 2026: numbered pins with
            an unnumbered list were confusing; 15 Nov: no ring). An hours warning
            replaces the address; rating and price follow; then the badges. */}
        <div
          className="mt-[2px] flex items-center gap-[6px] min-w-0 text-[12.5px] md:text-[13px] leading-[1.45]"
          style={{ color: "rgba(26,26,46,0.62)" }}
        >
          {pinIndex != null && <span data-pin-number="1" className="shrink-0">{pinIndex} ·</span>}
          {hoursSignal ? (
            <span className={`min-w-0 truncate ${openingHoursTone(hoursSignal)}`}>{openingHoursCaption(hoursSignal)}</span>
          ) : detail ? (
            <span className="min-w-0 truncate">{detail}</span>
          ) : null}
          {priceRange && (
            <span className="shrink-0 text-[11px] md:text-[11.5px] font-medium" style={{ color: "#B0541F" }}>
              {surfRating !== null ? `★ ${surfRating.toFixed(1)} · ` : ""}{priceRange}
            </span>
          )}
          <CardBadges card={card} className="shrink-0" />
        </div>
      </div>
    </Wrapper>
  );
}
