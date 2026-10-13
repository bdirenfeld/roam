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
