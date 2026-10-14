'use client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, CaretRight } from '@phosphor-icons/react';
import Overlay from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { JourneyGuidanceContext, useJourneyGuidance, type GuidanceScreen } from './JourneyGuidanceContext';
import { LESSONS, advanceLesson, freshLesson, lessonHistoryKey, parseLessonHistory, type LessonHistory, type LessonId } from './lessons';
import LessonPointer from './LessonPointer';

/** Optional lessons never auto-start and never write journey data. */
export default function FeatureWalkthroughs({ uid, screen, onBegin, children }: {
  uid: string | null; screen: GuidanceScreen | null; onBegin: () => void; children: ReactNode;
}) {
  const intro = useJourneyGuidance();
  const { toast } = useToast();
  const [history, setHistory] = useState<LessonHistory>({});
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [active, setActive] = useState<LessonId | null>(null);
  const [library, setLibrary] = useState(false);
  useEffect(() => {
    setActive(null); setLibrary(false);
    let stored: LessonHistory = {};
    if (uid) try { stored = parseLessonHistory(localStorage.getItem(lessonHistoryKey(uid))); } catch { /* Private browsing. */ }
    setHistory(stored); setLoadedUser(uid);
  }, [uid]);
  const enabled = !!uid && loadedUser === uid && !!screen && !!intro;
  useEffect(() => {
    if (!uid || loadedUser !== uid) return;
    try { localStorage.setItem(lessonHistoryKey(uid), JSON.stringify(history)); } catch { /* Guidance still works. */ }
  }, [uid, loadedUser, history]);
  const choose = useCallback(() => {
    onBegin(); setActive(null); setLibrary(true);
  }, [onBegin]);
  const context = useMemo(() => intro ? { ...intro, choose } : null, [intro, choose]);
  const start = (id: LessonId, restart = false) => {
    setHistory(h => ({ ...h, [id]: restart || !h[id] || h[id]?.complete ? freshLesson() : { ...h[id]!, paused: false } }));
    setLibrary(false); setActive(id);
  };
  const skip = () => {
    if (active) setHistory(h => ({ ...h, [active]: { ...(h[active] ?? freshLesson()), paused: true } }));
    setActive(null);
    toast({ message: 'Pick it up anytime from ⋯ → Walkthrough.' });
  };
  const next = () => {
    if (!active) return;
    const p = advanceLesson(history[active] ?? freshLesson());
    setHistory(h => ({ ...h, [active]: p }));
    if (p.complete) { setActive(null); toast({ message: 'You’re ready. Keep making this journey yours.' }); }
  };
  return <JourneyGuidanceContext.Provider value={enabled ? context : intro}>
    {children}
    {enabled && active && !library && <LessonPointer screen={screen!} lesson={active} step={history[active]?.step ?? 0} onNext={next} onSkip={skip} />}
    {enabled && library && <Overlay label="Walkthroughs" onClose={() => setLibrary(false)} widthClassName="md:w-[420px]">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <h2 className="font-display text-[23px] font-medium tracking-[-0.01em] text-activity">Walkthroughs</h2>
        <button type="button" aria-label="Close" className="grid h-11 w-11 -mr-2 place-items-center rounded-full hover:bg-activity/5" onClick={() => setLibrary(false)}><X size={16} weight="light" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-5 pb-6 text-activity">
        <p className="mb-3 text-[13px] text-activity/60">A little help, right where you need it.</p>
        <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 border-t border-activity/10 py-3 text-left" onClick={() => { setLibrary(false); if (intro?.resumable) intro.resume(); else intro?.restart?.(); }}>
          <span><span className="block text-[14.5px] font-medium">Your first journey</span><span className="block text-[12.5px] text-activity/60">{intro?.resumable ? 'Continue your walkthrough' : 'Find places and put them on a day'}</span></span><CaretRight size={16} weight="light" />
        </button>
        {(Object.keys(LESSONS) as LessonId[]).map(id => {
          const p = history[id];
          return <div key={id} className="border-t border-activity/10 py-1">
            <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 py-2 text-left" onClick={() => start(id)}>
              <span><span className="block text-[14.5px] font-medium">{LESSONS[id].title}</span><span className="block text-[12.5px] text-activity/60">{p?.complete ? 'Completed · Watch again' : p ? `Continue · Step ${p.step + 1} of 3` : LESSONS[id].description}</span></span><CaretRight size={16} weight="light" />
            </button>
            {p && !p.complete && <button type="button" className="mb-1 min-h-9 text-xs text-activity/60 underline underline-offset-4" onClick={() => start(id, true)}>Start again</button>}
          </div>;
        })}
      </div>
    </Overlay>}
  </JourneyGuidanceContext.Provider>;
}
