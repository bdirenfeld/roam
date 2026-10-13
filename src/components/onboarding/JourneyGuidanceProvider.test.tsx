// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyGuidanceProvider from './JourneyGuidanceProvider';
import { useGuidanceScreen, useJourneyGuidance, type GuidanceScreen } from './JourneyGuidanceContext';
import type { Card, Trip } from '@/types/database';
const mocks = vi.hoisted(() => ({ metadata: {} as Record<string, unknown>, count: 1, update: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'owner', user_metadata: mocks.metadata } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser: mocks.update,
  },
  from: () => ({ select: () => ({ eq: async () => ({ count: mocks.count, error: null }) }) }),
}) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./JourneyPointer', () => ({ default: ({ step, screen: current, onSkip, onNext, replay }: { step: string; screen: GuidanceScreen; onSkip: () => void; onNext: () => void; replay: boolean }) => <div role="note">{step}:{current.view}{replay && ':replay'}<button onClick={onSkip}>Skip</button><button onClick={onNext}>Next</button></div> }));
const trip = { id: 't1', user_id: 'owner', created_at: new Date().toISOString() } as Trip;
const saved = { id: 'c1', day_id: null, status: 'interested', place: { type: 'activity' } } as unknown as Card;
function Surface(props: GuidanceScreen) {
  useGuidanceScreen(props);
  const guide = useJourneyGuidance();
  return guide && <><button onClick={guide.resume}>Continue</button><button onClick={guide.restart}>Restart</button></>;
}
const app = (props: Partial<GuidanceScreen> = {}) => <JourneyGuidanceProvider><Surface trip={trip} cards={[]} view="map" readOnly={false} {...props} /></JourneyGuidanceProvider>;
beforeEach(() => { localStorage.clear(); mocks.metadata = {}; mocks.count = 1; mocks.update.mockReset().mockResolvedValue({ error: null }); });
afterEach(cleanup);
describe('live journey guidance', () => {
  it('advances on real saves, follows navigation, and restarts without touching cards', async () => {
    const view = render(app());
    await waitFor(() => expect(screen.getByRole('note').textContent).toContain('find:map'));
    view.rerender(app({ cards: [saved] }));
    await waitFor(() => expect(screen.getByRole('note').textContent).toContain('plan:map'));
    const scheduled = { ...saved, day_id: 'd1', status: 'in_itinerary' } as unknown as Card;
    view.rerender(app({ cards: [scheduled], view: 'day' }));
    await waitFor(() => expect(screen.getByRole('note').textContent).toContain('card:day'));
    view.rerender(app({ cards: [scheduled], view: 'map' }));
    await waitFor(() => expect(screen.getByRole('note').textContent).toContain('card:map'));
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByRole('note').textContent).toContain('card:map');
    fireEvent.click(screen.getByText('Restart'));
    expect(screen.getByRole('note').textContent).toContain('find:map:replay');
    expect(scheduled.day_id).toBe('d1');
  });
  it('remembers completion after reopening and on another journey', async () => {
    const scheduled = { ...saved, day_id: 'd1', status: 'in_itinerary' } as unknown as Card;
    const view = render(app());
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeNull());
    view.rerender(app({ cards: [scheduled], openedId: 'c1' }));
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { roam_journey_guidance_v1: expect.objectContaining({ completed: true }) } })));
    cleanup();
    render(app({ trip: { ...trip, id: 't2' } }));
    await screen.findByText('Continue');
    expect(screen.queryByRole('note')).toBeNull();
  });
  it('does not automatically coach existing users or expose owner guidance to guests', async () => {
    mocks.count = 3;
    const view = render(app());
    await screen.findByText('Continue');
    expect(screen.queryByRole('note')).toBeNull();
    view.rerender(app({ readOnly: true }));
    await waitFor(() => expect(screen.queryByText('Continue')).toBeNull());
  });
  it('uses account progress from another device', async () => {
    mocks.metadata = { roam_journey_guidance_v1: { step: 'plan', paused: true, completed: false, updatedAt: 20 } };
    render(app());
    await screen.findByText('Continue');
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByRole('note').textContent).toContain('plan:map');
  });
  it('does not interrupt an established user opening an empty day in their only journey', async () => {
    render(app({ trip: { ...trip, created_at: '2020-01-01T00:00:00Z' } }));
    await screen.findByText('Continue');
    expect(screen.queryByRole('note')).toBeNull();
  });
});
