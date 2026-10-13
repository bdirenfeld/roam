'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { installStub } from '@/app/demo/dataAdapter';
import { createTrainingState } from '@/app/demo/trainingState';
import { DEMO_TRIP, DEMO_DAYS } from '@/app/demo/fixtures';
import { GlobalSearchProvider } from '@/components/search/GlobalSearch';
import { AppOverlaysProvider } from '@/components/overlays/AppOverlays';
import { ToastProvider } from '@/components/ui/Toast';
import type { Card } from '@/types/database';
import JourneyGuidanceProvider from '@/components/onboarding/JourneyGuidanceProvider';

const WeekBoard = dynamic(() => import('@/components/plan/WeekBoard'), { ssr: false });
const FullMapClient = dynamic(() => import('@/components/map/FullMapClient'), { ssr: false });
const DayViewClient = dynamic(() => import('@/components/day/DayViewClient'), { ssr: false });
const DesktopMasthead = dynamic(() => import('@/components/ui/DesktopMasthead'), { ssr: false });
const BookingImportPreview = dynamic(() => import('../first-journey/BookingImportPreview'), { ssr: false });
type Model = ReturnType<typeof createTrainingState>;
// Dev-only review, real app components, isolated disposable journey data.
export default function FirstPointer() {
  return <GlobalSearchProvider><AppOverlaysProvider><ToastProvider><JourneyGuidanceProvider preview><PointerJourney /></JourneyGuidanceProvider></ToastProvider></AppOverlaysProvider></GlobalSearchProvider>;
}
function PointerJourney() {
  const router = useRouter();
  const [model, setModel] = useState<Model | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [phone, setPhone] = useState(false);
  const [view, setView] = useState<'map' | 'day' | 'week'>('map');
  const [dayId, setDayId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
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
    const practice = createTrainingState(true, { key: 'roam-first-pointer-design', tables: { trips: [DEMO_TRIP], days: DEMO_DAYS, cards: [], places: [], people: [] } });
    let active = true;
    installStub({ userId: 'owner-preview', tables: practice.tables, onWrite: (...args) => {
      practice.onWrite(...args);
      queueMicrotask(() => { if (active) setCards(practice.cards()); });
    },
      respond: async (url, init) => {
        if (url.pathname === '/api/places/autocomplete' && url.searchParams.get('input')?.includes('Your hotel')) return { predictions: [{ place_id: 'demo-onboarding-hotel' }] };
        if (url.pathname === '/api/places/bulk-import' && typeof init?.body === 'string' && init.body.includes('demo-onboarding-hotel')) return { imported: [{ place_id: 'demo-onboarding-hotel', title: 'Your hotel', created: true }] };
        return practice.respond(url, init);
      }, passHosts: [/^api\.mapbox\.com$/, /\.tiles\.mapbox\.com$/, /^events\.mapbox\.com$/] });
    const media = window.matchMedia('(max-width: 767px)');
    const resize = () => setPhone(media.matches);
    resize(); media.addEventListener('change', resize); setModel(practice);
    return () => { active = false; media.removeEventListener('change', resize); };
  }, []);

  // Keep navigation inside the review journey, without adding preview chrome.
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest('button');
      const label = button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? '';
      if (label.startsWith('Upload bookings') || label === 'Import a booking') {
        event.preventDefault(); event.stopPropagation(); setBooking(true);  return;
      }
      const link = element?.closest('a');
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
    {model && (phone ? view === 'day' ? <DayViewClient key={day.id} trip={DEMO_TRIP} days={DEMO_DAYS} dayWithCards={{ ...day, cards: cards.filter(c => c.day_id === day.id) }} hotelCards={cards.filter(c => c.place?.sub_type === 'hotel')} initialNotes={null} phone /> : <FullMapClient trip={DEMO_TRIP} days={DEMO_DAYS} cards={cards} /> : <><DesktopMasthead previewPath={`/trips/${DEMO_TRIP.id}/plan`} /><WeekBoard trip={DEMO_TRIP} initialDays={week} initialSaved={cards.filter(c => !c.day_id)} /></>)}
    {model && booking && <BookingImportPreview model={model} onClose={() => setBooking(false)} />}
  </main></AppRouterContext.Provider>;
}
