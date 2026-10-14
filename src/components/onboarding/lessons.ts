export const LESSONS = {
  bookings: { title: 'Keep a booking handy', description: 'Add a confirmation and find it when you need it.' },
  planning: { title: 'Adjust your day', description: 'Change a stop’s time as your plans change.' },
  details: { title: 'Know before you go', description: 'Keep tickets, meeting points and practical details together.' },
  sharing: { title: 'Bring everyone along', description: 'Give your travellers the journey link.' },
} as const;
export type LessonId = keyof typeof LESSONS;
export type LessonProgress = { step: number; paused: boolean; complete: boolean };
export type LessonHistory = Partial<Record<LessonId, LessonProgress>>;
export const freshLesson = (): LessonProgress => ({ step: 0, paused: false, complete: false });
export function parseLessonHistory(raw: string | null): LessonHistory {
  try {
    const value = JSON.parse(raw ?? '{}');
    const valid: LessonHistory = {};
    for (const id of Object.keys(LESSONS) as LessonId[]) {
      const p = value?.[id];
      if (p && Number.isInteger(p.step) && p.step >= 0 && p.step <= 2 && typeof p.paused === 'boolean' && typeof p.complete === 'boolean') valid[id] = { step: p.step, paused: p.paused, complete: p.complete };
    }
    return valid;
  } catch { return {}; }
}
export function advanceLesson(p: LessonProgress): LessonProgress {
  if (p.paused || p.complete) return p;
  return { ...p, step: Math.min(2, p.step + 1), complete: p.step === 2 };
}
export const lessonHistoryKey = (uid: string) => `roam-feature-walkthroughs-v1:${uid}`;
