'use client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GuidanceScreenContext, JourneyGuidanceContext, type GuidanceScreen } from '@/components/onboarding/JourneyGuidanceContext';
import LessonPointer from '@/components/onboarding/LessonPointer';
import { useToast } from '@/components/ui/Toast';
import { initialProgress, readProgress, transition, type LessonId, type Progress } from './lessonState';

// Only disposable preview state lives here. All visible guidance is production UI.
export default function LessonCoach({ lesson, children }: { lesson: LessonId; children: ReactNode }) {
  const [screen, setScreen] = useState<GuidanceScreen | null>(null);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const key = 'roam-lesson-progress-v1-' + lesson;
  const act = useCallback((action: Parameters<typeof transition>[1]) => setProgress(p => transition(p, action)), []);
  useEffect(() => {
    try { setProgress(readProgress(sessionStorage.getItem(key))); } catch { /* Private mode. */ }
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready) try { sessionStorage.setItem(key, JSON.stringify(progress)); } catch { /* Private mode. */ } }, [ready, key, progress]);
  useEffect(() => {
    const review = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent || e.data?.type !== 'roam-lesson-review') return;
      if (e.data.action === 'restart' || e.data.action === 'resume') act(e.data.action);
    };
    addEventListener('message', review);
    return () => removeEventListener('message', review);
  }, [act]);
  const context = useMemo(() => ({ resume: () => act('resume'), restart: () => act('restart'), resumable: !progress.complete }), [act, progress.complete]);
  const next = () => {
    act('advance');
    if (progress.step === 2) toast({ message: 'You’re ready. Keep making this journey yours.' });
  };
  const skip = () => { act('pause'); toast({ message: 'Pick it up anytime from ⋯ → Walkthrough.' }); };
  return <GuidanceScreenContext.Provider value={setScreen}><JourneyGuidanceContext.Provider value={context}>
    {children}
    {ready && screen && !progress.paused && !progress.complete && <LessonPointer screen={screen} lesson={lesson} step={progress.step} onNext={next} onSkip={skip} preview />}
  </JourneyGuidanceContext.Provider></GuidanceScreenContext.Provider>;
}
