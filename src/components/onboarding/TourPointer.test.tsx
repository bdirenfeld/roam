// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TourPointer from './TourPointer';
import { TOURS } from '@/lib/onboarding/walkthroughs';

/**
 * A screen's walkthrough hint, rendered (14 Oct 2026). It must ring the real
 * control, never one a sheet is covering, and never vanish without a way on.
 */
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = () => ({ x: 20, y: 400, width: 40, height: 40, top: 400, bottom: 440, left: 20, right: 60, toJSON() {} }) as DOMRect;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); document.body.innerHTML = ''; Element.prototype.getBoundingClientRect = realRect; });

describe('the walkthrough hint', () => {
  it('names the walkthrough and its step, and points at the control that is on screen', () => {
    document.body.insertAdjacentHTML('beforeend', '<button data-walk="budget-standard">Standard</button>');
    render(<TourPointer tour={TOURS.budget} step={0} onNext={() => {}} onSkip={() => {}} />);
    const note = screen.getByRole('note', { name: 'Budget walkthrough' });
    expect(note.textContent).toContain('Budget · Step 1 of 3');
    expect(note.textContent).toContain('Tap Standard to see each cost.');
  });

  it('switches to the better anchor once it appears (the group was opened)', () => {
    document.body.insertAdjacentHTML('beforeend', '<button data-walk="budget-standard">Standard</button><button aria-label="Exclude Flights">✓</button>');
    render(<TourPointer tour={TOURS.budget} step={0} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('note').textContent).toContain('Tick a cost');
  });

  it('stays hidden while a sheet covers its control, and shows inside its own sheet', () => {
    document.body.insertAdjacentHTML('beforeend', '<button data-walk="notes-item">Add an item</button><div role="dialog">Card</div>');
    render(<TourPointer tour={TOURS.notes} step={0} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.queryByRole('note')).toBeNull();
    cleanup(); document.body.innerHTML = '';
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><button data-walk="notes-item">Add an item</button></div>');
    render(<TourPointer tour={TOURS.notes} step={0} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('note').textContent).toContain('packing item');
  });

  it('a step waiting for its control stays out of the way; any other still offers Next', () => {
    render(<TourPointer tour={TOURS.stays} step={1} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.queryByRole('note')).toBeNull();
    cleanup();
    const next = vi.fn();
    render(<TourPointer tour={TOURS.day} step={1} onNext={next} onSkip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(next).toHaveBeenCalled();
  });

  it('the last step says Done', () => {
    document.body.insertAdjacentHTML('beforeend', '<button data-walk="bookings-upload">Upload</button>');
    render(<TourPointer tour={TOURS.bookings} step={1} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });
});
