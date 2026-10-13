'use client';
import { useState, useTransition } from 'react';
import { signInWithEmail, signInWithGoogle } from '@/lib/auth-actions';

/** Reuse the current auth actions and return directly to journey creation. */
export default function JourneySignIn({ preview = false }: { preview?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const previewMessage = 'This is a design preview. Sign-in will be connected when this page is added to the live app.';
  return <div className="journey-auth">
    <h1 id="auth-title">Sign in to Roam.</h1>
    <button className="auth-google" disabled={pending || sent} onClick={() => {
      if (preview) { setMessage(previewMessage); return; }
      startTransition(async () => { try { await signInWithGoogle('/trips/new'); } catch (error) {
        // Next redirects must propagate to the framework.
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
        setMessage('Couldn’t open Google sign-in. Please try again.');
      } });
    }}><GoogleIcon size={20} /><span>Continue with Google</span></button>
    <div className="auth-or">or use your email</div>
    <form onSubmit={event => {
      event.preventDefault();
      const email = String(new FormData(event.currentTarget).get('email') ?? '');
      if (preview) { setMessage(previewMessage); return; }
      startTransition(async () => {
        try { const result = await signInWithEmail(email, '/trips/new'); setMessage(result.message); setSent(result.sent); }
        catch { setMessage('Couldn’t send the link. Please try again.'); }
      });
    }}>
      <label htmlFor="journey-email">Email address</label>
      <input id="journey-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required disabled={pending || sent} />
      <button className="auth-submit" disabled={pending || sent}>{pending ? 'One moment…' : sent ? 'Check your inbox' : 'Email me a sign-in link'}</button>
    </form>
    <p className="auth-message" role="status">{message || 'New here? Signing in creates your account.'}</p>
    <style dangerouslySetInnerHTML={{ __html: `.journey-auth{padding:32px 34px;font-family:'DM Sans',sans-serif;color:#1a1a2e;background:#f5f4f1;min-height:100vh}.auth-eyebrow{font-size:10px!important;letter-spacing:1.6px;color:#b0541f!important;margin:0 0 17px!important}.journey-auth h1{font-size:34px;line-height:1.1;letter-spacing:-1.2px;font-weight:500;margin:0 0 28px}.journey-auth p{font-size:14px;color:#676775;line-height:1.6;margin:0 0 22px}.journey-auth button,.journey-auth input{font:inherit;width:100%;border-radius:8px;padding:12px 14px;font-size:14px}.journey-auth button{cursor:pointer}.auth-brand{font-size:28px!important;font-weight:600;letter-spacing:-1px;color:#1a1a2e!important;margin:0 0 30px!important}.auth-brand span{display:block;font-size:9px;font-weight:500;letter-spacing:1.2px;color:#b0541f;margin-top:5px}.auth-google{display:flex;align-items:center;justify-content:center;gap:12px;min-height:50px;background:white;border:1px solid #747775;color:#1f1f1f;font-weight:500!important;box-shadow:0 1px 2px #1a1a2e08}.auth-google svg{flex-shrink:0}.auth-google:hover{background:#fafafa;box-shadow:0 2px 6px #1a1a2e12}.auth-or{display:flex;align-items:center;gap:12px;font-size:11px;text-align:center;color:#73737d;margin:24px 0}.auth-or:before,.auth-or:after{content:"";height:1px;background:#deddda;flex:1}.auth-submit:hover{background:#97471a}@media(max-width:420px){.journey-auth{padding:26px 22px}}.journey-auth label{display:block;font-size:12px;margin-bottom:7px}.journey-auth input{border:1px solid #cfcfce;background:white;margin-bottom:12px}.auth-submit{background:#b0541f;color:white;border:0}.journey-auth button:disabled{opacity:.6;cursor:default}.journey-auth .auth-message{font-size:11px;margin:17px 0 0;min-height:36px}.journey-auth :focus-visible{outline:3px solid #cf865c;outline-offset:3px}` }} />
  </div>;
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
