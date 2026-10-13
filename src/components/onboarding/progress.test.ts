import { describe, expect, it } from 'vitest';
import { INITIAL, journeyStep, laterStep, parseProgress, shouldAutoStart } from './progress';
import type { Card } from '@/types/database';
const card = (extra = {}) => ({ id: 'a', status: 'interested', day_id: null, place: { type: 'activity' }, ...extra }) as unknown as Card;
describe('first-journey progress', () => {
  it('starts only on an empty first journey, never on an uncertain count', () => {
    expect(shouldAutoStart(null, 1, true)).toBe(true);
    expect(shouldAutoStart(null, 2, true)).toBe(false);
    expect(shouldAutoStart(null, null, true)).toBe(false);
    expect(shouldAutoStart(null, 1, false)).toBe(false);
  });
  it('remembers skipped and completed guidance across journeys', () => {
    expect(shouldAutoStart({ ...INITIAL, paused: true }, 1, true)).toBe(false);
    expect(shouldAutoStart({ ...INITIAL, completed: true }, 2, true)).toBe(false);
    expect(shouldAutoStart({ ...INITIAL, step: 'plan' }, 1, false)).toBe(true);
  });
  it('advances for a saved place or a direct-to-day save, ignoring archived cards', () => {
    expect(journeyStep([])).toBe('find');
    expect(journeyStep([card()])).toBe('plan');
    expect(journeyStep([card({ day_id: 'd', status: 'in_itinerary' })])).toBe('card');
    expect(journeyStep([card({ archived: true })])).toBe('find');
    expect(journeyStep([card({ status: 'cut' })])).toBe('find');
  });
  it('does not lose progress when navigating to an empty day', () => {
    expect(laterStep('card', journeyStep([]))).toBe('card');
  });
  it('rejects malformed stored progress', () => {
    expect(parseProgress({ step: 'bogus' })).toBeNull();
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress(INITIAL)).toEqual(INITIAL);
  });
});
