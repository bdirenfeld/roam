'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { installStub } from '@/app/demo/dataAdapter';
import { createTrainingState } from '@/app/demo/trainingState';
import { DEMO_TRIP as BASE_TRIP, DEMO_DAYS, DEMO_CARDS, DEMO_PLACES } from '@/app/demo/fixtures';
import { GlobalSearchProvider } from '@/components/search/GlobalSearch';
import { AppOverlaysProvider } from '@/components/overlays/AppOverlays';
import { ToastProvider } from '@/components/ui/Toast';
import type { Card } from '@/types/database';
import LessonCoach from './LessonCoach';
import JourneyGuidanceProvider from '@/components/onboarding/JourneyGuidanceProvider';
import type { LessonId } from './lessonState';
import Overlay from '@/components/ui/Overlay';
const DEMO_TRIP = { ...BASE_TRIP, user_id: 'owner-preview' };

const TripSettingsClient = dynamic(() => import('@/components/trip/TripSettingsClient'), { ssr: false });
const DocumentsSheet = dynamic(() => import('@/components/plan/DocumentsSheet'), { ssr: false });
const WeekBoard = dynamic(() => import('@/components/plan/WeekBoard'), { ssr: false });
const FullMapClient = dynamic(() => import('@/components/map/FullMapClient'), { ssr: false });
const DayViewClient = dynamic(() => import('@/components/day/DayViewClient'), { ssr: false });
const DesktopMasthead = dynamic(() => import('@/components/ui/DesktopMasthead'), { ssr: false });
const BookingImportPreview = dynamic(() => import('./BookingImportPreview'), { ssr: false });
type Model = ReturnType<typeof createTrainingState>;
// Dev-only review, real app components, isolated disposable journey data.
export default function LessonJourney({ lesson }: { lesson: LessonId }) {
  return <GlobalSearchProvider><AppOverlaysProvider><ToastProvider><LessonCoach lesson={lesson}><PointerJourney lesson={lesson} /></LessonCoach></ToastProvider></AppOverlaysProvider></GlobalSearchProvider>;
}
export function AppWalkthroughPreview() {
  return <GlobalSearchProvider><AppOverlaysProvider><ToastProvider><JourneyGuidanceProvider preview><PointerJourney lesson="planning" /></JourneyGuidanceProvider></ToastProvider></AppOverlaysProvider></GlobalSearchProvider>;
}
function PointerJourney({ lesson }: { lesson: LessonId }) {
  const router = useRouter();
  const [model, setModel] = useState<Model | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [phone, setPhone] = useState(false);
  const [view, setView] = useState<'map' | 'day' | 'week'>('day');
  const [dayId, setDayId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [documents, setDocuments] = useState(lesson === 'bookings');
  const [sharing, setSharing] = useState(lesson === 'sharing');
  const plannedDay = cards.find(c => c.day_id && c.status === 'in_itinerary')?.day_id;
  const navigate = useCallback((href: string) => {
    const url = new URL(href, location.origin);
    if (!url.pathname.startsWith(`/trips/${DEMO_TRIP.id}`)) return;
    const match = url.pathname.match(/\/days\/([^/]+)/);
    setDayId(match?.[1] ?? null);
    setView(url.pathname.endsWith('/map') ? 'map' : url.pathname.endsWith('/plan') ? 'week' : 'day');

  }, []);
  // Only the dev harness replaces navigation: native day buttons stay inside
  // this disposable journey instead of opening the separate finished demo.
  const previewRouter = useMemo(() => ({ ...router, push: navigate, replace: navigate,
    refresh: () => {}, prefetch: () => {}, back: () => setView('map'), forward: () => {} }), [router, navigate]);

  useEffect(() => {
    const practice = createTrainingState(false, { key: `roam-lesson-data-${lesson}`, tables: { trips: [DEMO_TRIP], days: DEMO_DAYS, cards: lesson === 'bookings' ? [] : DEMO_CARDS.filter(c => ['demo-amnh', 'demo-leons', 'demo-milk'].includes(c.id)), places: DEMO_PLACES, people: [] } });
    let active = true;
    installStub({ userId: 'owner-preview', tables: practice.tables, onWrite: (...args) => {
      practice.onWrite(...args);
      queueMicrotask(() => { if (active) setCards(practice.cards()); });
    },
      respond: async (url, init) => {
        if (url.pathname === '/api/share/send-invite') { window.dispatchEvent(new CustomEvent('roam-lesson-action', { detail: 'shared' })); return { sent: true }; }
        if (url.pathname === '/api/places/autocomplete' && url.searchParams.get('input')?.includes('Your hotel')) return { predictions: [{ place_id: 'demo-onboarding-hotel' }] };
        if (url.pathname === '/api/places/bulk-import' && typeof init?.body === 'string' && init.body.includes('demo-onboarding-hotel')) return { imported: [{ place_id: 'demo-onboarding-hotel', title: 'Your hotel', created: true }] };
        return practice.respond(url, init);
      }, passHosts: [/^api\.mapbox\.com$/, /\.tiles\.mapbox\.com$/, /^events\.mapbox\.com$/] });
    const media = window.matchMedia('(max-width: 767px)');
    const resize = () => setPhone(media.matches);
    resize(); media.addEventListener('change', resize); setModel(practice); setCards(practice.cards());
    return () => { active = false; media.removeEventListener('change', resize); };
  }, [lesson]);

  // Keep navigation inside the review journey, without adding preview chrome.
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest('button');
      const label = button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? '';
      if (label.startsWith('Upload bookings') || label === 'Import a booking' || label === 'Upload a confirmation') {
        event.preventDefault(); event.stopPropagation(); setDocuments(false); setBooking(true); return;
      }
      if (label === 'Bookings' || label === 'Share & settings') {
        event.preventDefault(); event.stopPropagation();
        // Close the native menu before mounting the isolated sheet. Its own
        // handler cannot run after this dev-only interception.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (label === 'Bookings') setDocuments(true); else setSharing(true);
        return;
      }
      const link = element?.closest('a');
      if (link?.hash === '#share') { event.preventDefault(); event.stopPropagation(); setSharing(true); return; }
      if (!link || !link.pathname.startsWith(`/trips/${DEMO_TRIP.id}`)) return;
      event.preventDefault(); event.stopPropagation();
      navigate(link.href);
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, [navigate]);

  const day = DEMO_DAYS.find(d => d.id === (dayId ?? plannedDay)) ?? DEMO_DAYS[0];
  const week = DEMO_DAYS.map(d => ({ ...d, cards: cards.filter(c => c.day_id === d.id) }));
  return <AppRouterContext.Provider value={previewRouter}><main className="min-h-[100dvh] bg-[#F5F4F1] text-activity">
    {model && (phone ? view === 'day' ? <DayViewClient key={`${day.id}:${cards.map(c => c.id).join(',')}`} trip={DEMO_TRIP} days={DEMO_DAYS} dayWithCards={{ ...day, cards: cards.filter(c => c.day_id === day.id) }} hotelCards={cards.filter(c => c.place?.sub_type === 'hotel')} initialNotes={null} phone /> : <FullMapClient trip={DEMO_TRIP} days={DEMO_DAYS} cards={cards} /> : <><DesktopMasthead previewPath={`/trips/${DEMO_TRIP.id}/plan`} /><WeekBoard key={cards.map(c => c.id).join(',')} trip={DEMO_TRIP} initialDays={week} initialSaved={cards.filter(c => !c.day_id)} /></>)}
    {model && documents && <DocumentsSheet tripId={DEMO_TRIP.id} onClose={() => setDocuments(false)} onImport={() => { setDocuments(false); setBooking(true); }} />}
    {model && sharing && <Overlay label="Share this journey" onClose={() => setSharing(false)}><TripSettingsClient trip={DEMO_TRIP} days={DEMO_DAYS} initialPeople={[]} initialShareToken="preview-only" initialGuests={[]} shareAvailable variant="overlay" scrollTo="share" onDismiss={() => setSharing(false)} /></Overlay>}
    {model && booking && <BookingImportPreview model={model} onClose={() => setBooking(false)} />}
  </main></AppRouterContext.Provider>;
}
