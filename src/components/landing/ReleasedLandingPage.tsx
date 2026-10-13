'use client';
import { useEffect } from 'react';
import JourneySignIn from './JourneySignIn';
import { FUNNEL, funnelEvent, funnelSource } from '@/lib/funnel';
import { landingMarkup, landingStyles, initializeLanding } from './landingContent.js';
const marketingMarkup = landingMarkup.replace(/<dialog id="auth-dialog"[\s\S]*?<\/dialog>/, '');

/** Approved landing design; authentication stays in the top-level React app. */
export default function ReleasedLandingPage({ signInFailed = false }: { signInFailed?: boolean }) {
  // Clarity funnel (10 Oct 2026), lost when this page replaced LandingPage on
  // 11 Oct and restored 13 Oct: the visit, its source, and the example tapped.
  useEffect(() => {
    funnelSource(window.location.search);
    funnelEvent(FUNNEL.landingView);
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-example]')) funnelEvent(FUNNEL.landingDemo);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  useEffect(() => {
    const cleanup = initializeLanding();
    if (signInFailed) (document.getElementById('auth-dialog') as HTMLDialogElement).showModal();
    return cleanup;
  }, [signInFailed]);
  return <>
    <style dangerouslySetInnerHTML={{ __html: landingStyles }} />
    <div dangerouslySetInnerHTML={{ __html: marketingMarkup }} />
    <dialog id="auth-dialog" aria-labelledby="auth-title">
      <button className="auth-close" id="close-auth" aria-label="Close sign-in"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      <div id="landing-auth-root">
        {signInFailed && <p role="alert" className="px-8 pt-4 text-sm">Sign-in didn’t finish. Please try again.</p>}
        <JourneySignIn />
      </div>
    </dialog>
  </>;
}
