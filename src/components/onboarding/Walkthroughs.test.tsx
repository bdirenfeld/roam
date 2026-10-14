// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyGuidanceProvider from './JourneyGuidanceProvider';
import { useJourneyGuidance, useResetWalkthroughs, useWalkthrough } from './JourneyGuidanceContext';
import type { TourId } from '@/lib/onboarding/walkthroughs';

/**
 * Which walkthrough a person gets, and how the tile and Profile bring them
 * back (14 Oct 2026). His two questions: someone with trips already who opens
 * Budget for the first time must get Budget; and "restart" must know what to
 * restart.
 */
const mocks = vi.hoisted(() => ({ metadata: {} as Record<string, unknown>, update: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'owner', user_metadata: mocks.metadata } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser: mocks.update,
  },
  from: () => ({ select: () => ({ eq: async () => ({ count: 3, error: null }) }) }),
}) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/trips/t1/estimate' }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./TourPointer', () => ({ default: ({ tour, step, onNext, onSkip }: { tour: { id: string }; step: number; onNext: () => void; onSkip: () => void }) => <div role="note">{tour.id}:{step}<button onClick={onNext}>Next</button><button onClick={onSkip}>Skip</button></div> }));

function Screen({ id, used }: { id: TourId; used: boolean }) {
  useWalkthrough(id, { ready: true, used });
  const tile = useJourneyGuidance();
  const reset = useResetWalkthroughs();
  return <>{tile && <button onClick={tile.resume}>Walkthrough</button>}{reset && <button onClick={reset}>Show walkthroughs again</button>}</>;
}
const saved = () => mocks.update.mock.calls.map(c => (c[0] as { data: Record<string, unknown> }).data.roam_walkthroughs_v1).filter(Boolean).pop() as Record<string, { status: string; step: number }> | undefined;

beforeEach(() => { localStorage.clear(); mocks.metadata = {}; mocks.update.mockReset().mockResolvedValue({ error: null }); mocks.toast.mockReset(); });
afterEach(cleanup);

describe('per-screen walkthroughs', () => {
  it('starts Budget the first time it opens, for someone with three journeys already', async () => {
    render(<JourneyGuidanceProvider><Screen id="budget" used={false} /></JourneyGuidanceProvider>);
    expect((await screen.findByRole('note')).textContent).toContain('budget:0');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('note').textContent).toContain('budget:1');
  });

  it('stays quiet on a feature already used, and records it as done', async () => {
    render(<JourneyGuidanceProvider><Screen id="budget" used /></JourneyGuidanceProvider>);
    await waitFor(() => expect(saved()?.budget?.status).toBe('done'));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('remembers a skip, and the tile runs this screen’s walkthrough again from the top', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { notes: { status: 'skipped', step: 1, updatedAt: 1 } } };
    render(<JourneyGuidanceProvider><Screen id="notes" used={false} /></JourneyGuidanceProvider>);
    fireEvent.click(await screen.findByText('Walkthrough'));
    expect((await screen.findByRole('note')).textContent).toBe('notes:0NextSkip');
  });

  it('picks one left part-way back up at its step', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { share: { status: 'underway', step: 2, updatedAt: 1 } } };
    render(<JourneyGuidanceProvider><Screen id="share" used /></JourneyGuidanceProvider>);
    expect((await screen.findByRole('note')).textContent).toContain('share:2');
  });

  it('Show walkthroughs again clears every one, and each shows again on its screen', async () => {
    mocks.metadata = { roam_walkthroughs_v1: { budget: { status: 'done', step: 2, updatedAt: 1 } } };
    render(<JourneyGuidanceProvider><Screen id="budget" used={false} /></JourneyGuidanceProvider>);
    fireEvent.click(await screen.findByText('Show walkthroughs again'));
    expect((await screen.findByRole('note')).textContent).toContain('budget:0');
    expect(mocks.update.mock.calls.some(c => (c[0] as { data: Record<string, unknown> }).data.roam_journey_guidance_v1)).toBe(true);
  });
});
