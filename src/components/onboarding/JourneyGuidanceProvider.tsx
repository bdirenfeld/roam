'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { GuidanceScreenContext, JourneyGuidanceContext, ResetWalkthroughsContext, WalkthroughRegistryContext, type GuidanceScreen, type WalkthroughScreen } from './JourneyGuidanceContext';
import { INITIAL, journeyStep, laterStep, parseProgress, shouldAutoStart, type Progress } from './progress';
import { TOURS, advance, fromTile, mergeRecords, onOpen, parseRecord, type TourId, type TourRecord, type TourState } from '@/lib/onboarding/walkthroughs';
import JourneyPointer from './JourneyPointer';
import TourPointer from './TourPointer';

const META_KEY = 'roam_journey_guidance_v1';
// The per-screen walkthroughs (14 Oct 2026): one record, a state per walkthrough.
const TOURS_KEY = 'roam_walkthroughs_v1';
// UI preference only: metadata is never used to grant access to a journey.
const writes = new Map<string, Promise<unknown>>();
function localKey(key: string, uid: string) { return `${key}:${uid}`; }
function localRead(key: string, uid: string): unknown {
  try { return JSON.parse(localStorage.getItem(localKey(key, uid)) ?? 'null'); } catch { return null; }
}

export default function JourneyGuidanceProvider({ children, preview = false }: { children: React.ReactNode; preview?: boolean }) {
  const [screen, setScreen] = useState<GuidanceScreen | null>(null);
  const [uid, setUid] = useState<string | null>(preview ? 'owner-preview' : null);
  const [ready, setReady] = useState(preview);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [active, setActive] = useState(preview);
  const [ownedCount, setOwnedCount] = useState<number | null>(preview ? 1 : null);
  const [countedTrip, setCountedTrip] = useState<string | null>(null);
  const [tours, setTours] = useState<TourRecord>({});
  const [screens, setScreens] = useState<Map<symbol, WalkthroughScreen>>(() => new Map());
  // The page the first journey finished on stays quiet: no second walkthrough
  // straight after "You're ready".
  const [hushPath, setHushPath] = useState<string | null>(null);
  const pathname = usePathname();
  const decided = useRef<string | null>(null);
  const currentUser = useRef(uid);
  const progressRef = useRef(progress); progressRef.current = progress;
  const toursRef = useRef(tours); toursRef.current = tours;
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
      if (!user) { setProgress(null); setTours({}); setReady(true); return; }
      const remote = parseProgress(user.user_metadata?.[META_KEY]);
      const local = parseProgress(localRead(META_KEY, user.id));
      setProgress(local && (!remote || local.updatedAt > remote.updatedAt) ? local : remote);
      setTours(mergeRecords(parseRecord(user.user_metadata?.[TOURS_KEY]), parseRecord(localRead(TOURS_KEY, user.id))));
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

  // Both records go to this device first, then to the account so they follow
  // the person to their other devices. Writes queue so they land in order.
  const persist = useCallback((key: string, value: unknown) => {
    if (preview || !uid) return;
    try { localStorage.setItem(localKey(key, uid), JSON.stringify(value)); } catch { /* private mode */ }
    const pending = (writes.get(uid) ?? Promise.resolve()).then(async () => {
      if (currentUser.current !== uid) return;
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user.id !== uid) return;
      const { error } = await sb.auth.updateUser({ data: { [key]: value } });
      if (error) console.error('[guidance] progress kept on this device:', error.message);
    }).catch(() => { /* Local progress remains available offline. */ });
    writes.set(uid, pending);
  }, [preview, uid]);
  const save = useCallback((next: Progress) => {
    progressRef.current = next; setProgress(next);
    persist(META_KEY, next);
  }, [persist]);
  const saveTour = useCallback((id: TourId, state: TourState) => {
    const next = { ...toursRef.current, [id]: state };
    toursRef.current = next; setTours(next);
    persist(TOURS_KEY, next);
  }, [persist]);
  const register = useCallback((key: symbol, s: WalkthroughScreen | null) => {
    setScreens(old => {
      const prev = old.get(key);
      if (s ? !!prev && prev.id === s.id && prev.ready === s.ready && prev.used === s.used : !prev) return old;
      const next = new Map(old);
      if (s) next.set(key, s); else next.delete(key);
      return next;
    });
  }, []);

  const eligible = !!screen && !screen.readOnly && (preview || screen.trip.user_id === uid);
  const actualStep = journeyStep(screen?.cards ?? []);
  useEffect(() => {
    if (!ready || !eligible || !screen || (!preview && countedTrip !== screen.trip.id) || decided.current === screen.trip.id) return;
    decided.current = screen.trip.id;
    const age = Date.now() - Date.parse(screen.trip.created_at);
    const newJourney = preview || (age >= 0 && age < 24 * 60 * 60 * 1000);
    // A replay asked for from Profile runs on whichever journey is opened next.
    if (shouldAutoStart(progressRef.current, ownedCount, screen.cards.length === 0 && newJourney) || (progressRef.current?.replay && !progressRef.current.completed && !progressRef.current.paused)) {
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
    setHushPath(window.location.pathname);
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

  // The screen's own walkthrough: the most recently opened screen that has one.
  // The first journey goes first; the rest wait until it is finished or skipped.
  const current = Array.from(screens.values()).pop() ?? null;
  const firstJourneyShowing = active && eligible && !!screen;
  useEffect(() => {
    if (!ready || preview || !uid || !current || !current.ready || firstJourneyShowing || hushPath === pathname) return;
    const verdict = onOpen(toursRef.current[current.id], current.used);
    if (verdict === 'start') saveTour(current.id, { status: 'underway', step: 0, updatedAt: Date.now() });
    else if (verdict === 'quiet-done') saveTour(current.id, { status: 'done', step: TOURS[current.id].steps.length - 1, updatedAt: Date.now() });
  }, [ready, preview, uid, current, firstJourneyShowing, hushPath, pathname, saveTour, tours]);
  const tourState = current ? tours[current.id] : undefined;
  const showTour = !!current && current.ready && tourState?.status === 'underway' && !firstJourneyShowing && hushPath !== pathname;
  const tourTile = useCallback(() => {
    if (!current) return;
    setHushPath(null);
    saveTour(current.id, fromTile(toursRef.current[current.id], Date.now()));
  }, [current, saveTour]);
  const tourNext = useCallback(() => {
    if (!current) return;
    const state = toursRef.current[current.id];
    if (!state) return;
    const after = advance(current.id, state, Date.now());
    saveTour(current.id, after);
    if (after.status === 'done') toast({ message: 'All done. Run it again anytime from ⋯ → Walkthrough.' });
  }, [current, saveTour, toast]);
  const tourSkip = useCallback(() => {
    if (!current) return;
    saveTour(current.id, { status: 'skipped', step: toursRef.current[current.id]?.step ?? 0, updatedAt: Date.now() });
    toast({ message: 'Pick it up anytime from ⋯ → Walkthrough.' });
  }, [current, saveTour, toast]);
  // Profile → "Show all walkthroughs again": each one shows once more on its
  // own screen; the first journey replays from step 1 on the next journey opened.
  const resetAll = useCallback(() => {
    setHushPath(null);
    decided.current = null;
    toursRef.current = {}; setTours({});
    persist(TOURS_KEY, {});
    save({ ...INITIAL, replay: true, updatedAt: Date.now() });
    toast({ message: 'Walkthroughs are back. Each one shows once, on its own screen.' });
  }, [persist, save, toast]);

  const tourTileOn = !!current && current.ready && !preview && !!uid;
  const tourResumable = tourState?.status === 'underway';
  // The tile: a first journey left part-way comes first (it is what a new
  // person is in the middle of); otherwise this screen's own walkthrough.
  const firstJourney = eligible && ready;
  const controls = useMemo(() => firstJourney && resumable ? { resume, restart, resumable }
    : tourTileOn ? { resume: tourTile, restart: tourTile, resumable: tourResumable }
    : firstJourney ? { resume, restart, resumable } : null,
  [tourTileOn, tourTile, tourResumable, firstJourney, resume, restart, resumable]);
  return <GuidanceScreenContext.Provider value={setScreen}><WalkthroughRegistryContext.Provider value={register}><ResetWalkthroughsContext.Provider value={uid && !preview ? resetAll : null}><JourneyGuidanceContext.Provider value={controls}>
    {children}
    {firstJourneyShowing && <JourneyPointer screen={screen} step={step} replay={!!progress?.replay} onSkip={skip} onNext={next} />}
    {showTour && current && tourState && <TourPointer tour={TOURS[current.id]} step={tourState.step} onNext={tourNext} onSkip={tourSkip} />}
  </JourneyGuidanceContext.Provider></ResetWalkthroughsContext.Provider></WalkthroughRegistryContext.Provider></GuidanceScreenContext.Provider>;
}
