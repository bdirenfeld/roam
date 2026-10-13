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
it('offers the finished example as the primary action, with no interactive walkthrough', () => {
  render(<ReleasedLandingPage />);
  expect(document.querySelector('#guide-dialog')).toBeNull();
  expect(document.querySelector('[data-guide]')).toBeNull();
  const primary=document.querySelector<HTMLButtonElement>('.hero-actions .primary')!;
  expect(primary.textContent).toBe('View example journey ↗');
  expect(document.querySelector('.hero-actions [data-auth]')).toBeNull();
  expect(document.querySelector('#demo-title')).toBeNull();
  expect(document.querySelector('#demo-section [data-example]')).toBeNull();
  fireEvent.click(primary);
  expect(document.querySelector('#image-dialog')?.hasAttribute('open')).toBe(true);
  expect(document.querySelector('#full-demo')?.getAttribute('src')).toContain('/demo?view=');
});
it('offers Desktop and Mobile with an accessible icon close control', () => {
  render(<ReleasedLandingPage />);
  fireEvent.click(document.querySelector('.hero-actions [data-example]')!);
  const modal=document.querySelector('#image-dialog')!;
  const mobile=modal.querySelector<HTMLButtonElement>('[data-modal-view="day"]')!;
  fireEvent.click(mobile);
  expect(document.querySelector('#full-demo')?.getAttribute('src')).toBe('/demo?view=day');
  expect(mobile.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(modal.querySelector('[data-modal-view="week"]')!);
  expect(document.querySelector('#full-demo')?.getAttribute('src')).toBe('/demo?view=week');
  expect(modal.querySelector('[data-modal-view="map"]')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Close example journey'}));
  expect(modal.hasAttribute('open')).toBe(false);
});
it('makes the example available after the video ends', () => {
  render(<ReleasedLandingPage />);
  fireEvent.ended(document.querySelector('#intro-video')!);
  const next=document.querySelector<HTMLButtonElement>('#video-next')!;
  expect(next.hidden).toBe(false);
  fireEvent.click(next);
  expect(document.querySelector('#image-dialog')?.hasAttribute('open')).toBe(true);
});
it('returns Google sign-in to existing journeys rather than forcing creation', async () => {
  render(<ReleasedLandingPage signInFailed />);
  expect(screen.getByRole('alert').textContent).toContain('Sign-in didn’t finish');
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  expect(screen.getByRole('heading',{name:'Sign in to Roam.'})).toBeTruthy();
  expect(screen.queryByText('Plan your journey.')).toBeNull();
  expect(screen.getByRole('button',{name:'Close sign-in'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));
  await waitFor(()=>expect(auth.signInWithGoogle).toHaveBeenCalledWith('/trips'));
});
it('returns email sign-in to journeys too', async () => {
  auth.signInWithEmail.mockResolvedValue({ sent: true, message: 'Check your inbox' });
  render(<ReleasedLandingPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'traveller@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
  await waitFor(() => expect(auth.signInWithEmail).toHaveBeenCalledWith('traveller@example.com', '/trips'));
});
