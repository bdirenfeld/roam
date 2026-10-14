// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeatureWalkthroughs from './FeatureWalkthroughs';
import { JourneyGuidanceContext, useJourneyGuidance, type GuidanceScreen } from './JourneyGuidanceContext';
import { advanceLesson, freshLesson, lessonHistoryKey, parseLessonHistory } from './lessons';
import type { Trip } from '@/types/database';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const rect = Element.prototype.getBoundingClientRect;
const current: GuidanceScreen = { trip: { id: 'real-journey-id', user_id: 'owner' } as Trip, cards: [], view: 'day', readOnly: false };
function Menu() {
  const guidance = useJourneyGuidance();
  return <><button onClick={guidance?.choose}>Walkthrough</button><button aria-label="More options">Menu</button></>;
}
function Harness({ uid = 'owner' }: { uid?: string }) {
  return <JourneyGuidanceContext.Provider value={{ resume: vi.fn(), restart: vi.fn(), resumable: false }}>
    <FeatureWalkthroughs uid={uid} screen={current} onBegin={() => {}}><Menu /></FeatureWalkthroughs>
  </JourneyGuidanceContext.Provider>;
}
beforeEach(() => {
  localStorage.clear();
  Element.prototype.getBoundingClientRect = () => ({ x: 20, y: 400, width: 100, height: 40, top: 400, bottom: 440, left: 20, right: 120, toJSON() {} }) as DOMRect;
});
afterEach(() => { cleanup(); Element.prototype.getBoundingClientRect = rect; });

describe('optional walkthroughs in the real app', () => {
  it('stays quiet until requested and uses the native walkthrough library', async () => {
    render(<Harness />);
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Walkthroughs' })).toBeTruthy();
    expect(screen.getByText('Your first journey')).toBeTruthy();
    expect(screen.getByText('Keep a booking handy')).toBeTruthy();
    expect(screen.getByText('Bring everyone along')).toBeTruthy();
  });
  it('resumes a paused lesson and keeps completed lessons available for replay', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    fireEvent.click(screen.getByText('Keep a booking handy'));
    expect((await screen.findByRole('note')).textContent).toContain('Step 1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip guidance' }));
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    expect(screen.getByText('Continue · Step 2 of 3')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep a booking handy'));
    expect((await screen.findByRole('note')).textContent).toContain('Step 2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(parseLessonHistory(localStorage.getItem(lessonHistoryKey('owner'))).bookings?.complete).toBe(true));
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    expect(screen.getByText('Completed · Watch again')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep a booking handy'));
    expect((await screen.findByRole('note')).textContent).toContain('Step 1 of 3');
  });
  it('does not carry another account’s progress or active hint across sign-in', async () => {
    localStorage.setItem(lessonHistoryKey('owner'), JSON.stringify({ sharing: { step: 2, paused: true, complete: false } }));
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    expect(await screen.findByText('Continue · Step 3 of 3')).toBeTruthy();
    rerender(<Harness uid="other-owner" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('Walkthrough', { exact: true }));
    expect(screen.queryByText('Continue · Step 3 of 3')).toBeNull();
    expect(parseLessonHistory(localStorage.getItem(lessonHistoryKey('owner'))).sharing?.step).toBe(2);
  });
  it('validates stored progress and never advances a paused or completed lesson', () => {
    expect(parseLessonHistory('{broken')).toEqual({});
    expect(parseLessonHistory('{"sharing":{"step":99,"paused":false,"complete":false}}')).toEqual({});
    const paused = { ...freshLesson(), paused: true };
    expect(advanceLesson(paused)).toEqual(paused);
    const completed = { ...freshLesson(), step: 2, complete: true };
    expect(advanceLesson(completed)).toEqual(completed);
  });
});
