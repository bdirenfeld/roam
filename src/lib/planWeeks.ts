// Calendar-week grouping and fold persistence for the desktop Plan board.
//
// This module is the ONLY place that computes week membership, evaluates the
// "show week bars at all" threshold, or touches localStorage for fold state.
// PlanBoard consumes one derived array and re-derives none of it — the week
// bar row, the pinned day-header row and the columns row all read the same
// resolved width and folded flag, which is what stops the three rows drifting
// out of alignment.

import type { Day } from "@/types/database";

// Column geometry — mirrors DayColumn's md:w-[280px] and the md:gap-5 (20px)
// carried by the header row and the columns row alike. A week bar spans its
// member columns exactly: n × COL_W + (n − 1) × COL_GAP. Keeping the numbers
// here means a future column-width change moves the bars with the columns; a
// bar computed from a stale constant would drift silently against the days it
// labels.
export const COL_W = 280;
export const COL_GAP = 20;
export const FOLDED_W = 140;

// Generic over the day shape so grouping preserves whatever the caller passed —
// PlanBoard hands in DayWithCards and needs the cards back out.
export interface PlanWeek<D extends Day = Day> {
  /** Stable key — the ISO date of this week's Monday. */
  key: string;
  /** Positional within the trip: the first calendar week holding a trip day is 1. */
  weekNumber: number;
  /** Member days, date-ordered. */
  days: D[];
  /** e.g. "6–12 Sep", "2 Apr", or "31 Aug – 6 Sep" across a month boundary. */
  range: string;
  /** Fewer than seven member days — rendered normally, labelled "· part week". */
  isPartial: boolean;
}

/** The board's local-parse pattern. Hydration-safe: no timezone shift, no SSR clock. */
function parseLocal(date: string): Date {
  return new Date(date + "T00:00:00");
}

/** The Monday that opens the calendar week containing `d`. Weeks are Mon–Sun. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay() is 0 for Sunday, so (day + 6) % 7 counts days elapsed since Monday.
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

function isoKey(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

// en-US, matching DayHeaderCell. en-GB abbreviates September as "Sept", which
// would put "4–5 Sept" on the bar above a header cell reading "Sep 4".
function shortMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}

// The mockup takes the month from the last day only, which renders a week
// straddling a month boundary as "31–6 Sep". Name both months in that case.
function formatRange(first: Date, last: Date): string {
  if (first.getMonth() !== last.getMonth()) {
    return `${first.getDate()} ${shortMonth(first)} – ${last.getDate()} ${shortMonth(last)}`;
  }
  if (first.getDate() === last.getDate()) return `${last.getDate()} ${shortMonth(last)}`;
  return `${first.getDate()}–${last.getDate()} ${shortMonth(last)}`;
}

/**
 * Group days into Monday–Sunday calendar weeks, ordered, numbered positionally
 * within the trip. Partial weeks at either end are kept whole and flagged —
 * nothing is padded and nothing is hidden.
 */
export function groupDaysIntoWeeks<D extends Day>(days: D[]): PlanWeek<D>[] {
  const buckets = new Map<string, { monday: Date; days: D[] }>();

  for (const day of days) {
    // Day.date is typed non-null, but the board guards it defensively and so
    // do we — an undated day is skipped, never a crash.
    if (!day.date) continue;
    const monday = mondayOf(parseLocal(day.date));
    const key = isoKey(monday);
    const bucket = buckets.get(key);
    if (bucket) bucket.days.push(day);
    else buckets.set(key, { monday, days: [day] });
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.monday.getTime() - b.monday.getTime())
    .map((bucket, i) => {
      const ordered = [...bucket.days].sort((x, y) => x.date.localeCompare(y.date));
      return {
        key: isoKey(bucket.monday),
        weekNumber: i + 1,
        days: ordered,
        range: formatRange(
          parseLocal(ordered[0].date),
          parseLocal(ordered[ordered.length - 1].date),
        ),
        isPartial: ordered.length < 7,
      };
    });
}

/**
 * Week bars appear only on a trip of eight days or more that spans more than
 * one calendar week. Below that the bars are noise.
 *
 * In practice the second clause never decides anything — any trip of eight
 * days necessarily touches two calendar weeks, since seven is the most a
 * single week can hold. It is kept because it states the actual intent, and
 * because a future grouping that is not seven days wide would need it.
 */
export function shouldShowWeeks(days: Day[]): boolean {
  const dated = days.filter((d) => d.date);
  if (dated.length < 8) return false;
  return groupDaysIntoWeeks(dated).length > 1;
}

/** Width of one week's slot in every row — the single source for the formula. */
export function weekSlotWidth(dayCount: number, folded: boolean): number {
  return folded ? FOLDED_W : dayCount * COL_W + (dayCount - 1) * COL_GAP;
}

// ── Fold-state persistence ─────────────────────────────────────
// Fold state is a set of DAY ids, never week ids: a week renders folded when
// every member day is in the set. Keyed per trip, following the house
// roam_snake_case convention already used by roam_board_bg_<tripId>.

const storageKey = (tripId: string) => `roam_plan_folded_days_${tripId}`;

/** Missing, corrupt, or throwing storage all mean "nothing folded" — never a crash. */
export function readFoldedDays(tripId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function writeFoldedDays(tripId: string, dayIds: Set<string>): void {
  try {
    if (dayIds.size === 0) localStorage.removeItem(storageKey(tripId));
    else localStorage.setItem(storageKey(tripId), JSON.stringify(Array.from(dayIds)));
  } catch {
    // Storage unavailable (private mode, quota, blocked). Fold state is a
    // convenience — losing it must never interrupt the board.
  }
}

// ── List collapse ──────────────────────────────────────────────
// The board's lists are user-created and unbounded — a traveller can invent
// "Research", "Prep", "Logistics" and three more next week — so collapse state
// is a SET of list ids under ONE key per trip, exactly the shape (and exactly
// the failure rules) of the folded-days set above. A key per list would grow
// localStorage with every list ever made and leave an orphan behind each time
// one is deleted. It lives beside its sibling so the board has ONE module that
// touches localStorage, and so the two can never drift on key shape or error
// handling.

const collapsedListsKey = (tripId: string) => `roam_plan_collapsed_lists_${tripId}`;

/** Missing, corrupt, or throwing storage all mean "nothing collapsed" — never a crash. */
export function readCollapsedLists(tripId: string): Set<string> {
  try {
    const raw = localStorage.getItem(collapsedListsKey(tripId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function writeCollapsedLists(tripId: string, listIds: Set<string>): void {
  try {
    if (listIds.size === 0) localStorage.removeItem(collapsedListsKey(tripId));
    else localStorage.setItem(collapsedListsKey(tripId), JSON.stringify(Array.from(listIds)));
  } catch {
    /* see writeFoldedDays */
  }
}
