// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyGuidanceProvider from './JourneyGuidanceProvider';
import { useGuidanceScreen, useJourneyGuidance, useWalkthrough } from './JourneyGuidanceContext';
import type { TourId } from '@/lib/onboarding/walkthroughs';
import type { Trip } from '@/types/database';

/**
 * Which walkthrough a person gets, and how ⋯ → Walkthrough brings them back
 * (14 Oct 2026). His two questions: someone with trips already who opens
 * Budget for the first time must get Budget; and "restart" must know what to
 * restart — the list answers it by showing where each one stands.
 */
const mocks = vi.hoisted(() => ({ metadata: {} as Record<string, unknown>, update: vi.fn(), toast: vi.fn(), push: vi.fn(), estimate: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'owner', user_metadata: mocks.metadata } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser: mocks.update,
  },
  from: () => ({ select: () => ({ eq: async () => ({ count: 3, error: null }) }) }),
}) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/trips/t1/days/d1', useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/overlays/AppOverlays', () => ({ useEstimate: () => ({ open: mocks.estimate }), useJourneyNotes: () => ({ open: vi.fn() }), useTripSettings: () => ({ open: vi.fn() }) }));
vi.mock('@/components/ui/Overlay', () => ({ default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock('./TourPointer', () => ({ default: ({ tour, step, onNext, onSkip }: { tour: { id: string }; step: number; onNext: () => void; onSkip: () => void }) => <div role="note">{tour.id}:{step}<button onClick={onNext}>Next</button><button onClick={onSkip}>Skip</button></div> }));

const trip = { id: 't1', user_id: 'owner', created_at: '2026-01-01T00:00:00Z' } as Trip;
function Screen({ id, used }: { id: TourId; used: boolean }) {
  useGuidanceScreen({ trip, cards: [], view: 'day', readOnly: false });
  useWalkthrough(id, { ready: true, used });
  const tile = useJourneyGuidance();
  return tile?.choose ? <button onClick={tile.choose}>Walkthrough</button> : null;
}
const saved = () => mocks.update.mock.calls.map(c => (c[0] as { data: Record<string, unknown> }).data.roam_walkthroughs_v1).filter(Boolean).pop() as Record<string, { status: string; step: number }> | undefined;
const app = (id: TourId, used = false) => render(<JourneyGuidanceProvider><Screen id={id} used={used} /></JourneyGuidanceProvider>);

beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 }); localStorage.clear(); mocks.metadata = {}; mocks.update.mockReset().mockResolvedValue({ error: null }); mocks.toast.mockReset(); mocks.push.mockReset(); mocks.estimate.mockReset(); });
afterEach(cleanup);

describe('per-screen walkthroughs', () => {
  it('starts Budget the first time it opens, for someone with three journeys already', async () => {
    app('budget');
    expect((await screen.findByRole('note')).textContent).toContain('budget:0');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('note').textContent).toContain('budget:1');
  });

  it('stays quiet on a feature already used, and records it as done', async () => {
    app('budget', true);
    await waitFor(() => expect(saved()?.budget?.status).toBe('done'));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('picks one left part-way back up at its step', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { share: { status: 'underway', step: 2, updatedAt: 1 } } };
    app('share', true);
    expect((await screen.findByRole('note')).textContent).toContain('share:2');
  });
});

describe('the Walkthroughs list (⋯ → Walkthrough)', () => {
  it('says where each one stands, and runs this screen’s one again from the top', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { day: { status: 'skipped', step: 1, updatedAt: 1 }, notes: { status: 'underway', step: 1, updatedAt: 1 }, budget: { status: 'done', step: 2, updatedAt: 1 } } };
    app('day');
    fireEvent.click(await screen.findByText('Walkthrough'));
    const list = screen.getByTestId('walkthrough-library');
    expect(within(list).getByText('Your day').nextSibling?.textContent).toBe('Skipped · Run it again');
    expect(within(list).getByText('Notes').nextSibling?.textContent).toBe('Continue · Step 2 of 3');
    expect(within(list).getByText('Budget').nextSibling?.textContent).toBe('Done · Run it again');
    fireEvent.click(within(list).getByText('Your day'));
    expect((await screen.findByRole('note')).textContent).toBe('day:0NextSkip');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('picking another screen’s walkthrough opens that screen', async () => {
    app('day');
    fireEvent.click(await screen.findByText('Walkthrough'));
    fireEvent.click(within(screen.getByTestId('walkthrough-library')).getByText('Budget'));
    expect(mocks.estimate).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(saved()?.budget).toMatchObject({ status: 'underway', step: 0 }));
    fireEvent.click(await screen.findByText('Walkthrough'));
    fireEvent.click(within(screen.getByTestId('walkthrough-library')).getByText('Your map'));
    expect(mocks.push).toHaveBeenCalledWith('/trips/t1/map');
  });

  it('Show all again clears every one; the first journey replays first, the rest wait their turn', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { day: { status: 'done', step: 2, updatedAt: 1 } } };
    app('day');
    fireEvent.click(await screen.findByText('Walkthrough'));
    fireEvent.click(screen.getByText('Show all again'));
    await waitFor(() => expect(saved()).toEqual({}));
    const first = mocks.update.mock.calls.map(c => (c[0] as { data: Record<string, unknown> }).data.roam_journey_guidance_v1).filter(Boolean).pop();
    expect(first).toMatchObject({ step: 'find', replay: true, completed: false });
    expect(screen.queryByText('day:0', { exact: false })).toBeNull();
  });

  it('a computer lists the week board, not the phone’s day view', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1300 });
    app('week');
    fireEvent.click(await screen.findByText('Walkthrough'));
    const list = screen.getByTestId('walkthrough-library');
    expect(within(list).queryByText('The week board')).not.toBeNull();
    expect(within(list).queryByText('Your day')).toBeNull();
    expect(within(list).queryByText('Travel')).toBeNull();
  });
});
