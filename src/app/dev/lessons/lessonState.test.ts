import { describe, expect, it } from 'vitest';
import { initialProgress, isLesson, readProgress, transition } from './lessonState';

describe('optional contextual lessons', () => {
  it('pauses without losing the current step, and resumes there', () => {
    const started = transition(initialProgress(), 'advance');
    const paused = transition(started, 'pause');
    expect(transition(paused, 'advance')).toEqual(paused);
    expect(transition(readProgress(JSON.stringify(paused)), 'resume')).toEqual(started);
  });
  it('keeps completion until an explicit restart', () => {
    const finished = [1, 2, 3].reduce(p => transition(p, 'advance'), initialProgress());
    expect(finished.complete).toBe(true);
    expect(transition(finished, 'resume')).toEqual(finished);
    expect(transition(finished, 'restart')).toEqual({ ...initialProgress(), replay: true });
  });
  it('lets Next walk through every step without requiring a booking or invitation', () => {
    const next = transition(initialProgress(), 'advance');
    expect(next.step).toBe(1);
    expect(next.replay).toBe(true);
    expect(transition(next, 'observe')).toEqual(next);
    const last = transition(next, 'advance');
    expect(last.step).toBe(2);
    expect(transition(last, 'advance').complete).toBe(true);
  });
  it('restarts at step one even if the journey already has data', () => {
    const restarted = transition({ step: 2, complete: true, paused: false }, 'restart');
    expect(transition(restarted, 'observe')).toEqual(restarted);
    expect(restarted.step).toBe(0);
  });
  it('rejects stale or invalid progress and unknown lesson routes', () => {
    for (const value of ['null', '{}', 'broken', '{"step":80,"paused":false,"complete":false}']) expect(readProgress(value)).toEqual(initialProgress());
    expect(isLesson('bookings')).toBe(true);
    expect(isLesson('__proto__')).toBe(false);
    expect(isLesson('made-up')).toBe(false);
  });
});
