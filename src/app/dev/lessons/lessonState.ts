export const lessons = {
  bookings: { title: 'Keep a booking handy', outcome: 'Add a confirmation, then find it in your day.' },
  planning: { title: 'Adjust your day', outcome: 'Open a place and change its time.' },
  details: { title: 'Know before you go', outcome: 'Find the details and where to add your own.' },
  sharing: { title: 'Bring everyone along', outcome: 'Share the plan with someone travelling with you.' },
} as const;
export type LessonId = keyof typeof lessons;
export const isLesson = (value: string): value is LessonId => Object.hasOwn(lessons, value);
export type Progress = { step: number; paused: boolean; complete: boolean; replay?: boolean };
export const initialProgress = (): Progress => ({ step: 0, paused: false, complete: false });
export function transition(progress: Progress, action: 'advance' | 'observe' | 'pause' | 'resume' | 'restart'): Progress {
  if (action === 'restart') return { ...initialProgress(), replay: true };
  if (action === 'pause') return { ...progress, paused: true };
  if (action === 'resume') return progress.complete ? progress : { ...progress, paused: false };
  if (progress.paused || progress.complete) return progress;
  if (action === 'observe' && progress.replay) return progress;
  return { ...progress, replay: action === 'advance' || progress.replay, step: Math.min(2, progress.step + 1), complete: progress.step >= 2 };
}
export function readProgress(raw: string | null): Progress {
  try {
    const p = JSON.parse(raw ?? 'null');
    if (p && Number.isInteger(p.step) && p.step >= 0 && p.step <= 2 && typeof p.paused === 'boolean' && typeof p.complete === 'boolean') return p;
  } catch { /* A new lesson is safe if browser storage is unavailable or stale. */ }
  return initialProgress();
}
