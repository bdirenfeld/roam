'use client';
import { useEffect } from 'react';
import JourneySignIn from './JourneySignIn';
import { landingMarkup, landingStyles, initializeLanding } from './landingContent.js';
const marketingMarkup = landingMarkup.replace(/<dialog id="auth-dialog"[\s\S]*?<\/dialog>/, '');

/** Approved landing design; authentication stays in the top-level React app. */
export default function ReleasedLandingPage({ signInFailed = false }: { signInFailed?: boolean }) {
  useEffect(() => {
    const cleanup = initializeLanding();
    if (signInFailed) (document.getElementById('auth-dialog') as HTMLDialogElement).showModal();
    return cleanup;
  }, [signInFailed]);
  return <>
    <style dangerouslySetInnerHTML={{ __html: landingStyles }} />
    <div dangerouslySetInnerHTML={{ __html: marketingMarkup }} />
    <dialog id="auth-dialog" aria-labelledby="auth-title">
      <div className="dialog-top"><span id="auth-title">Sign in</span><button className="text-button" id="close-auth">Close</button></div>
      <div id="landing-auth-root">
        {signInFailed && <p role="alert" className="px-8 pt-4 text-sm">Sign-in didn’t finish. Please try again.</p>}
        <JourneySignIn />
      </div>
    </dialog>
  </>;
}
