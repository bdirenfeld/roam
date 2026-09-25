/**
 * The desktop week (24 Sep 2026): days across, hours down, every timed card a
 * block. Pure geometry and snapping live here so the component stays a view
 * and the rules can be tested against real rows.
 */

export const HOUR_START = 7;      // 7 am
export const HOUR_END   = 23;     // 11 pm — the last row starts here
export const PX_PER_HOUR = 48;
export const SNAP_MIN    = 30;   // drags land on the half hour (Brennan, 25 Sep 2026); the card keeps exact times
export const NO_END_MIN  = 45;    // a card with a start and no end draws this tall
export const MIN_LEN_MIN = 30;    // a resize can't go shorter than this

/** "HH:MM[:SS]" → minutes since midnight. */
export function toMin(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** minutes since midnight → "HH:MM:00", the shape the cards table stores. */
export function toTime(m: number): string {
  const c = Math.max(0, Math.min(24 * 60 - 1, m));
  const h = Math.floor(c / 60), mm = c % 60;
  return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}:00`;
}

export function snap(m: number): number {
  return Math.round(m / SNAP_MIN) * SNAP_MIN;
}

/** Grid y (px from the top of the hour rows) → minutes since midnight, snapped
 *  and clamped to the drawn hours. */
export function minutesAtY(y: number): number {
  const raw = HOUR_START * 60 + (y / PX_PER_HOUR) * 60;
  return Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, snap(raw)));
}

export function gridHeight(): number {
  return (HOUR_END - HOUR_START + 1) * PX_PER_HOUR;
}

export interface Block {
  id: string;
  startMin: number;
  /** null when the card has no end time; the block draws NO_END_MIN tall. */
  endMin: number | null;
}

export interface Placed extends Block {
  top: number;
  height: number;
  /** 0-based lane and lane count for cards that overlap in time. */
  lane: number;
  lanes: number;
}

function effectiveEnd(b: Block): number {
  return b.endMin !== null ? b.endMin : b.startMin + NO_END_MIN;
}

/**
 * Lay a day's blocks out: y from time, and side-by-side lanes for overlaps,
 * the way a calendar does. Overlap is decided on the DRAWN extent, so a
 * no-end card still gets a lane. Sorted by start, then longest first.
 */
export function placeBlocks(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) =>
    a.startMin - b.startMin || effectiveEnd(b) - effectiveEnd(a),
  );
  // Sweep: a cluster is a run of blocks each overlapping the cluster's extent.
  const out: Placed[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const b of cluster) {
      let lane = laneEnds.findIndex((end) => end <= b.startMin);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = effectiveEnd(b);
      laneOf.set(b.id, lane);
    }
    for (const b of cluster) {
      const top = ((b.startMin - HOUR_START * 60) / 60) * PX_PER_HOUR;
      const height = Math.max(22, ((effectiveEnd(b) - b.startMin) / 60) * PX_PER_HOUR - 3);
      out.push({ ...b, top, height, lane: laneOf.get(b.id)!, lanes: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -1;
  };
  for (const b of sorted) {
    if (cluster.length && b.startMin >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, effectiveEnd(b));
  }
  flush();
  return out;
}

/** A move keeps the duration; a card with no end keeps having no end. */
export function movedTimes(b: Block, newStartMin: number): { start: string; end: string | null } {
  const s = snap(newStartMin);
  if (b.endMin === null) return { start: toTime(s), end: null };
  return { start: toTime(s), end: toTime(s + (b.endMin - b.startMin)) };
}

/** A resize sets the end, never shorter than MIN_LEN_MIN after the start. */
export function resizedEnd(b: Block, newEndMin: number): string {
  return toTime(Math.max(b.startMin + MIN_LEN_MIN, snap(newEndMin)));
}

/** The top edge dragged: a new start, never past (end − 30 min), never before the grid. */
export function resizedStart(b: Block, newStartMin: number): string {
  const latest = b.endMin === null ? Infinity : b.endMin - MIN_LEN_MIN;
  return toTime(Math.min(latest, Math.max(HOUR_START * 60, snap(newStartMin))));
}

export function fmt12(m: number): string {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}${mm ? ":" + (mm < 10 ? "0" : "") + mm : ""}${h < 12 ? "am" : "pm"}`;
}
