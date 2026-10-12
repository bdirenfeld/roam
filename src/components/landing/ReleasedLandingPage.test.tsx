// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const auth = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), signInWithEmail: vi.fn() }));
vi.mock('@/lib/auth-actions', () => auth);
import ReleasedLandingPage from './ReleasedLandingPage';
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable:true, value:function(){this.setAttribute('open','')} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable:true, value:function(){this.removeAttribute('open')} });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('opens working top-level Google sign-in and returns to journey creation', async () => {
  render(<ReleasedLandingPage />);
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  expect(screen.getByRole('dialog',{name:'Sign in'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));
  await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalledWith('/trips/new'));
});
it('starts the guided sample on the public demo route and shows auth failures', () => {
  render(<ReleasedLandingPage signInFailed />);
  expect(screen.getByRole('alert').textContent).toContain('Sign-in didn’t finish');
  fireEvent.click(screen.getByRole('dialog',{name:'Sign in'}).querySelector('#close-auth')!);
  fireEvent.click(screen.getAllByRole('button',{name:'Build a sample journey →'})[0]);
  expect(screen.getByRole('dialog',{name:'Start your practice journey.'})).toBeTruthy();
  expect(document.querySelector('#training-frame-holder iframe')?.getAttribute('src')).toBe('/demo?view=new&training=true&reset=true');
});
it('hands off a completed practice journey to sign-in', () => {
  render(<ReleasedLandingPage />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Build a sample journey →' })[0]);
  const notify = (data: Record<string, unknown>) => {
    const frame = document.querySelector<HTMLIFrameElement>('#training-frame-holder iframe')!;
    fireEvent(window, new MessageEvent('message', { origin: location.origin, source: frame.contentWindow, data }));
  };
  notify({ type: 'roam-training-created' });
  notify({ type: 'roam-practice-state', count: 2, planned: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Add a sample booking →' }));
  notify({ type: 'roam-training-booking' });
  fireEvent.click(screen.getByRole('button', { name: 'Plan my days →' }));
  notify({ type: 'roam-practice-state', count: 2, planned: 3 });
  fireEvent.click(screen.getByRole('button', { name: 'See my mobile agenda →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Plan my own journey →' }));
  expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeTruthy();
  expect(document.querySelector('#guide-dialog')?.hasAttribute('open')).toBe(false);
});
