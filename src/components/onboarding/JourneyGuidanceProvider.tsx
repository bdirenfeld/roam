'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { GuidanceScreenContext, JourneyGuidanceContext, type GuidanceScreen } from './JourneyGuidanceContext';
import { INITIAL, journeyStep, laterStep, parseProgress, shouldAutoStart, type Progress } from './progress';
import JourneyPointer from './JourneyPointer';
import FeatureWalkthroughs from './FeatureWalkthroughs';

const META_KEY = 'roam_journey_guidance_v1';
// UI preference only: metadata is never used to grant access to a journey.
const writes = new Map<string, Promise<unknown>>();
function localKey(uid: string) { return `${META_KEY}:${uid}`; }
function localProgress(uid: string) {
  try { return parseProgress(JSON.parse(localStorage.getItem(localKey(uid)) ?? 'null')); } catch { return null; }
}

export default function JourneyGuidanceProvider({ children, preview = false }: { children: React.ReactNode; preview?: boolean }) {
  const [screen, setScreen] = useState<GuidanceScreen | null>(null);
  const [uid, setUid] = useState<string | null>(preview ? 'owner-preview' : null);
  const [ready, setReady] = useState(preview);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [active, setActive] = useState(preview);
  const [ownedCount, setOwnedCount] = useState<number | null>(preview ? 1 : null);
  const [countedTrip, setCountedTrip] = useState<string | null>(null);
  const decided = useRef<string | null>(null);
  const currentUser = useRef(uid);
  const progressRef = useRef(progress); progressRef.current = progress;
  const { toast } = useToast();

  useEffect(() => {
    if (preview) return;
    const sb = createClient();
    let live = true;
    const load = async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!live) return;
      const user = session?.user;
      currentUser.current = user?.id ?? null;
      setUid(user?.id ?? null); setActive(false); decided.current = null;
      if (!user) { setProgress(null); setReady(true); return; }
      const remote = parseProgress(user.user_metadata?.[META_KEY]);
      const local = localProgress(user.id);
      setProgress(local && (!remote || local.updatedAt > remote.updatedAt) ? local : remote);
      setReady(true);
    };
    void load().catch(() => { if (live) setReady(true); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== currentUser.current) {
        setReady(false); setActive(false);
        // Supabase auth calls must run outside the auth callback's lock.
        setTimeout(() => { if (live) void load().catch(() => setReady(true)); }, 0);
      }
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, [preview]);

  const tripId = screen?.trip.id;
  useEffect(() => {
    if (preview || !uid || !tripId) return;
    let live = true;
    // Recount on journey entry: the layout may have mounted before journey #1 existed.
    createClient().from('trips').select('id', { count: 'exact', head: true }).eq('user_id', uid).then(({ count, error }) => {
      if (live) { setOwnedCount(error ? null : count); setCountedTrip(tripId); }
    }, () => {
      if (live) { setOwnedCount(null); setCountedTrip(tripId); }
    });
    return () => { live = false; };
  }, [preview, uid, tripId]);

  const save = useCallback((next: Progress) => {
    progressRef.current = next; setProgress(next);
    if (preview || !uid) return;
    try { localStorage.setItem(localKey(uid), JSON.stringify(next)); } catch { /* private mode */ }
    const pending = (writes.get(uid) ?? Promise.resolve()).then(async () => {
      if (currentUser.current !== uid) return;
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user.id !== uid) return;
      const { error } = await sb.auth.updateUser({ data: { [META_KEY]: next } });
      if (error) console.error('[guidance] progress kept on this device:', error.message);
    }).catch(() => { /* Local progress remains available offline. */ });
    writes.set(uid, pending);
  }, [preview, uid]);

  const eligible = !!screen && !screen.readOnly && (preview || screen.trip.user_id === uid);
  const actualStep = journeyStep(screen?.cards ?? []);
  useEffect(() => {
    if (!ready || !eligible || !screen || (!preview && countedTrip !== screen.trip.id) || decided.current === screen.trip.id) return;
    decided.current = screen.trip.id;
    const age = Date.now() - Date.parse(screen.trip.created_at);
    const newJourney = preview || (age >= 0 && age < 24 * 60 * 60 * 1000);
    if (shouldAutoStart(progressRef.current, ownedCount, screen.cards.length === 0 && newJourney)) {
      setActive(true);
      save({ ...(progressRef.current ?? INITIAL), updatedAt: Date.now() });
    }
  }, [ready, eligible, screen, ownedCount, save, preview, countedTrip]);

  const step = progress?.replay ? progress.step : laterStep(progress?.step ?? 'find', actualStep);
  useEffect(() => {
    if (active && eligible && progress && !progress.replay && progress.step !== step) save({ ...progress, step, updatedAt: Date.now() });
  }, [active, eligible, progress, step, save]);
  const finish = useCallback(() => {
    setActive(false);
    save({ ...(progressRef.current ?? INITIAL), step: 'card', paused: false, completed: true, replay: false, updatedAt: Date.now() });
    toast({ message: 'You’re ready. Keep making this journey yours.' });
  }, [save, toast]);
  useEffect(() => {
    if (active && eligible && step === 'card' && screen?.openedId && screen.cards.some(c => c.id === screen.openedId && c.day_id && c.status === 'in_itinerary')) finish();
  }, [active, eligible, step, screen, finish]);
  const skip = useCallback(() => {
    setActive(false);
    save({ ...(progressRef.current ?? INITIAL), step, paused: true, updatedAt: Date.now() });
    toast({ message: 'Pick it up anytime from ⋯ → Walkthrough.' });
  }, [save, step, toast]);
  const resume = useCallback(() => {
    setActive(true);
    save({ ...(progressRef.current ?? INITIAL), paused: false, completed: false, updatedAt: Date.now() });
  }, [save]);
  const restart = useCallback(() => {
    setActive(true);
    save({ ...INITIAL, replay: true, updatedAt: Date.now() });
  }, [save]);
  const next = useCallback(() => {
    if (step === 'card') { finish(); return; }
    save({ ...(progressRef.current ?? INITIAL), step: step === 'find' ? 'plan' : 'card', updatedAt: Date.now() });
  }, [step, save, finish]);
  const resumable = !!progress && !progress.completed;
  const controls = useMemo(() => eligible && ready ? { resume, restart, resumable } : null, [eligible, ready, resume, restart, resumable]);
  const beginFeature = useCallback(() => {
    setActive(false);
    if (active) save({ ...(progressRef.current ?? INITIAL), step, paused: true, updatedAt: Date.now() });
  }, [active, save, step]);
  return <GuidanceScreenContext.Provider value={setScreen}><JourneyGuidanceContext.Provider value={controls}>
    <FeatureWalkthroughs uid={uid} screen={eligible ? screen : null} onBegin={beginFeature}>
    {children}
    {active && eligible && screen && <JourneyPointer screen={screen} step={step} replay={!!progress?.replay} onSkip={skip} onNext={next} />}
    </FeatureWalkthroughs>
  </JourneyGuidanceContext.Provider></GuidanceScreenContext.Provider>;
}
