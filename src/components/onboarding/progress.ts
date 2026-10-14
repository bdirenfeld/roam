import type { Card } from '@/types/database';
export type Step = 'find' | 'plan' | 'card';
export type Progress = { step: Step; paused: boolean; completed: boolean; updatedAt: number; replay?: boolean };
export const INITIAL: Progress = { step: 'find', paused: false, completed: false, updatedAt: 0 };
export function parseProgress(value: unknown): Progress | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Progress;
  return ['find', 'plan', 'card'].includes(p.step) && typeof p.paused === 'boolean' && typeof p.completed === 'boolean' && typeof p.updatedAt === 'number' ? p : null;
}
export function journeyStep(cards: Card[]): Step {
  const stops = cards.filter(c => !(c as typeof c & { archived?: boolean }).archived && c.status !== 'cut' && ['activity', 'food'].includes(c.place?.type ?? ''));
  return stops.some(c => c.day_id && c.status === 'in_itinerary') ? 'card' : stops.length ? 'plan' : 'find';
}
export function laterStep(a: Step, b: Step): Step {
  const steps: Step[] = ['find', 'plan', 'card'];
  return steps[Math.max(steps.indexOf(a), steps.indexOf(b))];
}
export function shouldAutoStart(progress: Progress | null, ownedCount: number | null, empty: boolean): boolean {
  return progress ? !progress.paused && !progress.completed : ownedCount === 1 && empty;
}

const ORDER: Step[] = ['find', 'plan', 'card'];
/** "Step 2 of 3" — shown on every hint, so picking a walkthrough back up never reads as starting over. */
export function stepLabel(step: Step): string {
  return `Step ${ORDER.indexOf(step) + 1} of ${ORDER.length}`;
}
/**
 * The hint when the step's own control isn't on this screen. Find places and
 * Plan my trip live only on the Map, so from the day or the week every step
 * points at the Map — in its own words. Until 13 Oct 2026 steps 1 and 2 shared
 * one line ("Open the map to search for places and plan your days"), so a
 * walkthrough resumed at step 2 from the day view read as a restart.
 */
export function mapHint(step: Step): string {
  if (step === 'find') return 'Open the map to find places for this journey.';
  if (step === 'plan') return 'Place saved. Next, open the map and tap Plan my trip to put it on a day.';
  return 'Open a place in your agenda or on the map to see its details.';
}
