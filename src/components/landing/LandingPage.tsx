"use client";

import { useEffect, useState, useTransition } from "react";
import { signInWithGoogle, signInWithEmail } from "@/lib/auth-actions";
import { FUNNEL, funnelEvent, funnelSource } from "@/lib/funnel";
import {
  INK,
  SIENNA,
  PARCHMENT,
  INK_SOFT,
  RULE_STRONG,
  CAPTION_SOFT,
  PHASES,
  Wordmark,
  SmallCaps,
  FreeLine,
  Doors,
  ScreenPlate,
  GoogleButton,
} from "./landingAtoms";

// The logged-out front door (10 Oct 2026, landing + growth audit): product first,
// no stock photograph. It replaced the Amalfi photo page of 26 Sep 2026.
// The first screen is the words, the way in, and the app itself peeking up
// from below. The three movements sit in one strip; there is no separate
// "How it works" section because the plates ARE how it works.

const ON_DARK_BODY = "rgba(250,247,242,0.92)";

export default function LandingPage({ signInFailed = false }: { signInFailed?: boolean }) {
  const [isPending, startTransition] = useTransition();
  // Count the visit and tag its source (/ig, /reddit, /beta) for Clarity.
  useEffect(() => {
    funnelSource(window.location.search);
    funnelEvent(FUNNEL.landingView);
  }, []);
  function handleSignIn() {
    funnelEvent(FUNNEL.signInGoogle);
    startTransition(() => signInWithGoogle());
  }
  const [email, setEmail] = useState("");
  const [emailNote, setEmailNote] = useState<string | null>(
    signInFailed ? "That link expired or was already used. Send a fresh one, or use Google." : null,
  );
  const [emailPending, setEmailPending] = useState(false);
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (emailPending) return;
    setEmailPending(true);
    const r = await signInWithEmail(email);
    setEmailPending(false);
    setEmailNote(r.message);
    if (r.sent) {
      funnelEvent(FUNNEL.signInEmail);
      setEmail("");
    }
  }
  const emailForm = (
    <form onSubmit={handleEmail} style={{ marginTop: 10, display: "flex", gap: 8 }}>
      <input
        type="email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        placeholder="or your email"
        aria-label="Email address for a sign-in link"
        autoComplete="email"
        required
        style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, padding: "0 14px", fontSize: 14.5, background: "#fff", color: INK, border: `1px solid ${RULE_STRONG}`, outline: "none" }}
      />
      <button
        type="submit"
        disabled={emailPending}
        style={{ height: 44, padding: "0 16px", borderRadius: 12, background: INK, color: PARCHMENT, fontSize: 14, fontWeight: 500, border: "none", opacity: emailPending ? 0.5 : 1 }}
      >
        {emailPending ? "Sending…" : "Send link"}
      </button>
    </form>
  );
  const emailNoteEl = emailNote ? <p style={{ marginTop: 8, fontSize: 13, color: INK_SOFT }}>{emailNote}</p> : null;

  const gateway = (
    <>
      <GoogleButton skin="dark" full onClick={handleSignIn} pending={isPending} />
      <FreeLine color={CAPTION_SOFT} />
      {emailForm}
      {emailNoteEl}
      <div style={{ marginTop: 16 }}>
        <Doors color={INK_SOFT} />
      </div>
    </>
  );

  return (
    <main style={{ background: PARCHMENT, color: INK }}>
      {/* ── PHONE ───────────────────────────────────────────────── */}
      <div className="md:hidden">
        <div style={{ padding: "24px 22px 0" }}>
          <Wordmark size={24} />
        </div>
        <div style={{ padding: "34px 22px 0" }}>
          <div style={{ width: 38, height: 2, background: SIENNA, borderRadius: 1, marginBottom: 16 }} />
          <h1 className="font-display italic" style={{ fontWeight: 500, fontSize: 38, lineHeight: 1.06, letterSpacing: "-0.01em" }}>
            The whole trip, in one place.
          </h1>
          <p className="font-sans" style={{ marginTop: 14, fontSize: 15.5, lineHeight: 1.58, letterSpacing: "-0.005em", color: INK_SOFT }}>
            Helps you plan the trip, so you can actually enjoy it.
          </p>
          <div style={{ marginTop: 22 }}>{gateway}</div>
        </div>

        {/* The app, in one strip: the three movements side by side, swiped. */}
        <div style={{ marginTop: 30, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "flex", gap: 16, padding: "0 22px 8px", width: "max-content" }}>
            {PHASES.map((p) => (
              <div key={p.word} style={{ width: 236, scrollSnapAlign: "start", flex: "0 0 auto" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span className="font-display italic" style={{ fontSize: 15, fontWeight: 500, color: SIENNA }}>{p.n}</span>
                  <span className="font-display italic" style={{ fontSize: 19, fontWeight: 500 }}>{p.word}</span>
                </div>
                <ScreenPlate src={p.src} pos={p.pos} w={236} h={340} />
                <p className="font-sans" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: INK_SOFT }}>{p.line}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: INK, padding: "44px 22px", marginTop: 36 }}>
          <h2 className="font-display italic" style={{ fontWeight: 500, fontSize: 30, lineHeight: 1.14, letterSpacing: "-0.01em", color: PARCHMENT }}>
            Start with the next place you want to go.
          </h2>
          <div style={{ marginTop: 22 }}>
            <GoogleButton skin="light" full onClick={handleSignIn} pending={isPending} />
          </div>
          <p className="font-sans" style={{ marginTop: 10, fontSize: 12.5, color: ON_DARK_BODY, opacity: 0.8 }}>Free. No card.</p>
        </div>
        <Footer />
      </div>

      {/* ── DESKTOP ─────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <div style={{ padding: "34px 56px 0" }}>
          <Wordmark size={28} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 460px) minmax(0, 1fr)", gap: 64, alignItems: "center", padding: "56px 56px 72px", minHeight: "calc(100svh - 90px)" }}>
          <div>
            <div style={{ width: 46, height: 2, background: SIENNA, borderRadius: 1, marginBottom: 24 }} />
            <h1 className="font-display italic" style={{ fontWeight: 500, fontSize: 56, lineHeight: 1.04, letterSpacing: "-0.01em" }}>
              The whole trip, in&nbsp;one place.
            </h1>
            <p className="font-sans" style={{ marginTop: 20, fontSize: 18, lineHeight: 1.6, letterSpacing: "-0.005em", color: INK_SOFT, maxWidth: 440 }}>
              Helps you plan the trip, so you can actually enjoy it.
            </p>
            <div style={{ marginTop: 30, maxWidth: 400 }}>{gateway}</div>
          </div>
          {/* Three plates in a row, the middle one a touch higher: a hand of cards. */}
          <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "flex-end", flexWrap: "wrap" }}>
            {PHASES.map((p, i) => (
              <div key={p.word} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", transform: i === 1 ? "translateY(-28px)" : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span className="font-display italic" style={{ fontSize: 16, fontWeight: 500, color: SIENNA }}>{p.n}</span>
                  <span className="font-display italic" style={{ fontSize: 20, fontWeight: 500 }}>{p.word}</span>
                </div>
                <ScreenPlate src={p.src} pos={p.pos} w={200} h={296} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: INK, padding: "84px 56px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 60, flexWrap: "wrap" }}>
            <h2 className="font-display italic" style={{ maxWidth: 600, fontWeight: 500, fontSize: 44, lineHeight: 1.14, letterSpacing: "-0.01em", color: PARCHMENT }}>
              Start with the next place you want to go.
            </h2>
            <div style={{ flex: "0 0 auto" }}>
              <GoogleButton skin="light" size="lg" onClick={handleSignIn} pending={isPending} />
              <p className="font-sans" style={{ marginTop: 10, fontSize: 12.5, color: ON_DARK_BODY, opacity: 0.8 }}>Free. No card.</p>
            </div>
          </div>
        </div>
        <Footer wide />
      </div>
    </main>
  );
}

function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <div style={{ padding: wide ? "34px 56px" : "24px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Wordmark size={wide ? 20 : 18} />
      <SmallCaps color={CAPTION_SOFT} size={wide ? 10 : 9}>
        © Roam 2026 · <a href="/privacy" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy</a> · <a href="/terms" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>Terms</a>
      </SmallCaps>
    </div>
  );
}
