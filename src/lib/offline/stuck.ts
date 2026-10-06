/**
 * When a queued write is worth mentioning while online (6 Oct 2026). A queue
 * that drains within a couple of minutes says nothing; an entry still there
 * after STUCK_MS is "stuck" and gets one quiet line with Try again.
 */
export const STUCK_MS = 2 * 60_000;

export function stuckCount(pending: { createdAt: number }[], now: number, after = STUCK_MS): number {
  return pending.filter((p) => now - p.createdAt >= after).length;
}
