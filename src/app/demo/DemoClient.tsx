'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { GlobalSearchProvider } from '@/components/search/GlobalSearch';
import { AppOverlaysProvider } from '@/components/overlays/AppOverlays';
import { ToastProvider } from '@/components/ui/Toast';
import { installStub } from './dataAdapter';
import { DEMO_CARDS, DEMO_DAYS, DEMO_TRIP, DEMO_WEEK, DEMO_PLACES, DEMO_SAVED } from './fixtures';
import SampleBooking from './SampleBooking';
import { createTrainingState, practiceDestinations } from './trainingState';

function LoadingSample() { return <p role="status" className="p-5 text-sm text-activity/50">Opening the sample journey…</p>; }
const DayViewClient = dynamic(() => import('@/components/day/DayViewClient'), { ssr: false, loading: LoadingSample });
const FullMapClient = dynamic(() => import('@/components/map/FullMapClient'), { ssr: false, loading: LoadingSample });
const WeekBoard = dynamic(() => import('@/components/plan/WeekBoard'), { ssr: false, loading: LoadingSample });
const NewJourneyForm = dynamic(() => import('@/components/trip/NewJourneyForm'), { ssr: false, loading: LoadingSample });
const CardBottomSheet = dynamic(() => import('@/components/cards/CardBottomSheet'), { ssr: false, loading: LoadingSample });

export default function DemoClient({ initialView = 'day', initialDay, initialCard, initialTraining = false }: { initialView?: string; initialDay?: string; initialCard?: string; initialTraining?: boolean }) {
  const query = useSearchParams();
  const view = query.get('view') ?? initialView;
  const selected = query.get('card') ?? initialCard;
  const guideCard = DEMO_CARDS.find(c => c.id === `demo-${query.get('guide')}`);
  const guideScheduled = query.get('scheduled') === 'true';
  // Card's current generated type omits the nullable day used by saved places.
  const guidedCards = guideCard ? [{ ...guideCard, day_id: guideScheduled ? DEMO_DAYS[2].id : null, start_time: guideScheduled ? (query.get('time') ?? guideCard.start_time) : null, end_time: null } as unknown as typeof guideCard] : DEMO_CARDS;
  const shownWeek = guideCard ? DEMO_DAYS.map(d => ({ ...d, cards: guidedCards.filter(c => c.day_id === d.id) })) : DEMO_WEEK;
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const training = initialTraining || query.get('training') === 'true';
  const [practice, setPractice] = useState<ReturnType<typeof createTrainingState> | null>(null);
  useEffect(() => {
    const model = training ? createTrainingState(query.get('reset') === 'true') : createTrainingState(false, { key: 'roam-finished-demo-v6', tables: { trips: [DEMO_TRIP], days: DEMO_DAYS, cards: [...guidedCards, ...DEMO_SAVED], places: DEMO_PLACES, people: [] } });
    setPractice(model);
    installStub({
      userId: 'owner-preview',
      tables: model?.tables ?? { trips: [DEMO_TRIP], days: DEMO_DAYS, cards: guidedCards, places: DEMO_PLACES },
      onWrite: model?.onWrite,
      respond: model?.respond,
      passHosts: [/^api\.mapbox\.com$/, /\.tiles\.mapbox\.com$/, /^events\.mapbox\.com$/, /^ejluvgjiqcwvqhzqpkrz\.supabase\.co$/],
    });
    model?.notify();
    setReady(true); setOpen(true);
  // Each guide step loads its own isolated frame; these values are fixed per mount.
  }, [selected, view]);
  useEffect(() => {
    const back = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest('button, [role=menuitem]');
      const label = button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? '';
      if (label.startsWith('Upload bookings') || label === 'Bookings' || label === 'Import a booking') {
        event.preventDefault(); event.stopPropagation();
        if (training) window.parent.postMessage({ type: 'roam-training-request-booking' }, location.origin);
        else window.location.assign('/demo?view=booking');
        return;
      }
      if (['Search', 'Budget', 'Notes', 'Share & settings', 'Documents', 'Attachments', 'Share journey', 'Invite people', 'Where to stay', 'Paste a TikTok or Instagram link'].includes(label)) {
        event.preventDefault(); event.stopPropagation();
        setNotice('This account feature is available in the full app. In this demo, try the supplied booking confirmation and the preloaded places.');
        return;
      }
      const link = (event.target as HTMLElement).closest('a');
      if (link?.getAttribute('href') === '/') {
        event.preventDefault(); event.stopPropagation();
        window.parent.postMessage({ type: 'roam-demo-close' }, window.location.origin);
      }
      const href = link?.getAttribute('href');
      if (href?.startsWith('/trips/')) {
        event.preventDefault(); event.stopPropagation();
        const path = href.split('?')[0].split('/');
        const nextView = path[3] === 'map' ? 'map' : path[3] === 'plan' ? 'week' : 'day';
        window.location.assign('/demo?' + (training ? 'training=true&' : '') + 'view=' + nextView + (path[3] === 'days' && path[4] ? '&day=' + encodeURIComponent(path[4]) : ''));
      }
    };
    document.addEventListener('click', back, true);
    return () => document.removeEventListener('click', back, true);
  }, [training]);
  if (!ready) return <p className="p-5 text-sm text-activity/50">Opening the sample journey…</p>;
  const trip = practice?.currentTrip() ?? DEMO_TRIP;
  const allDays = practice?.days() ?? DEMO_DAYS;
  const allCards = practice?.cards() ?? guidedCards;
  const week = practice ? allDays.map(d => ({ ...d, cards: allCards.filter(c => c.day_id === d.id) })) : shownWeek;
  const chosen = DEMO_CARDS.find(c => c.id === `demo-${selected}`);
  const day = week.find(d => d.id === (query.get('day') ?? initialDay ?? chosen?.day_id)) ?? (training ? week.find(d => d.cards.length) ?? week[0] : week[2]);
  return <GlobalSearchProvider><AppOverlaysProvider><ToastProvider>
    <div className="mobile-container flex flex-col bg-white md:bg-transparent">
      <main className="flex-1" data-landing-demo={view}>
        {notice && <div role="dialog" aria-label="About this demo" className="fixed inset-x-4 top-4 z-[200] p-5 rounded-xl bg-white shadow-xl border"><p>{notice}</p><button className="mt-3 underline" onClick={() => setNotice('')}>Got it</button></div>}
        {view === 'booking' && practice ? <SampleBooking model={practice} /> : view === 'new' ? <NewJourneyForm practiceDestinations={practiceDestinations} seed={{ destDisplay: 'New York, NY, USA', destLat: 40.724, destLng: -73.999, start: '2026-07-23', end: '2026-07-26' }} onDismiss={() => window.parent.postMessage({ type: 'roam-demo-close' }, window.location.origin)} onCreated={() => window.parent.postMessage({ type: 'roam-training-created' }, window.location.origin)} />
          : view === 'week' ? <WeekBoard trip={trip} initialDays={week} initialSaved={practice ? allCards.filter(c => !c.day_id) : guideCard && !guideScheduled ? guidedCards : []} />
          : view === 'map' ? <FullMapClient trip={trip} days={allDays} cards={allCards} />
          : day ? <DayViewClient key={day.id} trip={trip} days={allDays} dayWithCards={day} hotelCards={allCards.filter(c => c.place?.sub_type === 'hotel')} initialNotes={null} phone /> : <LoadingSample />}
        {chosen && open && <CardBottomSheet card={chosen} days={DEMO_DAYS} tripDestination={DEMO_TRIP.destination ?? ''} partySize={2} onClose={() => setOpen(false)} />}
      </main>
    </div>
  </ToastProvider></AppOverlaysProvider></GlobalSearchProvider>;
}
