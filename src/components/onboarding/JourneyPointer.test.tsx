// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JourneyPointer from './JourneyPointer';
import type { GuidanceScreen } from './JourneyGuidanceContext';
import type { Trip } from '@/types/database';

/**
 * The hint, rendered. On 13 Oct 2026 a walkthrough paused at step 2 and picked
 * up from the day view read as a restart: Plan my trip lives only on the Map,
 * so the hint fell back to the Map link with step 1's words. Each step now says
 * its own thing off the Map, under a "Step N of 3" label.
 */

const trip = { id: 't1', user_id: 'owner', created_at: new Date().toISOString() } as Trip;
const day: GuidanceScreen = { trip, cards: [], view: 'day', readOnly: false };
const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  // jsdom lays nothing out; give every element a box on screen so the pointer can anchor.
  Element.prototype.getBoundingClientRect = () => ({ x: 20, y: 400, width: 40, height: 40, top: 400, bottom: 440, left: 20, right: 60, toJSON() {} }) as DOMRect;
  // The day view's bottom bar: a Map link, and no Find places or Plan my trip.
  document.body.insertAdjacentHTML('beforeend', '<a id="maplink" href="/trips/t1/map">Map</a>');
});
afterEach(() => {
  cleanup();
  document.getElementById('maplink')?.remove();
  Element.prototype.getBoundingClientRect = realRect;
});

describe('the walkthrough hint off the Map', () => {
  it('step 2 says step 2, and names Plan my trip', () => {
    render(<JourneyPointer screen={day} step="plan" replay={false} onSkip={() => {}} onNext={() => {}} />);
    const note = screen.getByRole('note', { name: 'Getting started hint' });
    expect(note.textContent).toContain('Step 2 of 3');
    expect(note.textContent).toContain('Plan my trip');
    expect(note.textContent).not.toContain('search for places');
  });

  it('step 1 reads differently from step 2', () => {
    render(<JourneyPointer screen={day} step="find" replay={false} onSkip={() => {}} onNext={() => {}} />);
    const one = screen.getByRole('note').textContent;
    cleanup();
    render(<JourneyPointer screen={day} step="plan" replay={false} onSkip={() => {}} onNext={() => {}} />);
    const two = screen.getByRole('note').textContent;
    expect(one).toContain('Step 1 of 3');
    expect(one).not.toEqual(two);
  });
});
