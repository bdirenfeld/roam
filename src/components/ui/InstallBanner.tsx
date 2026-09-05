"use client";

// ── "Put Roam on your phone" ───────────────────────────────────────────────
// A website cannot install itself; the closest any phone allows is this.
// Android (Chrome, Edge, Samsung): the browser hands us its install prompt
// and one tap on our button opens it. iPhone: no browser exposes that, so
// the card says the two steps (Share, then Add to Home Screen). Shown once,
// on every screen of the app at phone width, never when already running as
// an app, and never again after "Not now" (Brennan, Sep 2026: "it's not
// obvious how to download it onto your phone as an app").

import { useEffect, useState } from "react";

const DISMISS_KEY = "roam_install_banner_v2";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export default function InstallBanner() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* private mode */ }
    if (isStandalone()) return;
    if (isIosSafari()) { setMode("ios"); return; }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setMode(null);
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") dismiss();
    else setPromptEvent(null);
  };

  if (!mode) return null;

  return (
    <div
      role="dialog"
      aria-label="Put Roam on your phone"
      className="md:hidden fixed left-3 right-3 z-[60] bg-white rounded-2xl shadow-sheet px-5 py-4"
      style={{ bottom: "calc(84px + env(safe-area-inset-bottom))", border: "1px solid rgba(26,26,46,0.10)" }}
    >
      <p className="font-display italic text-[19px] leading-tight" style={{ color: "#1A1A2E" }}>
        Put Roam on your phone
      </p>
      {mode === "android" ? (
        <>
          <p className="text-[13px] leading-[1.55] mt-1" style={{ color: "rgba(26,26,46,0.62)" }}>
            It opens like an app, works offline, and your journeys are one tap away.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => void install()}
              className="h-10 px-5 rounded-full text-[13.5px] font-semibold active:opacity-80"
              style={{ background: "#1A1A2E", color: "#F5F4F1" }}
            >
              Add to phone
            </button>
            <button type="button" onClick={dismiss} className="text-[13px] font-medium" style={{ color: "rgba(26,26,46,0.5)" }}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-[1.55] mt-1" style={{ color: "rgba(26,26,46,0.62)" }}>
            Tap the Share button
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block mx-1 -mt-0.5">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            at the bottom of the screen, then <span className="font-semibold" style={{ color: "#1A1A2E" }}>Add to Home Screen</span>. Roam becomes an app icon.
          </p>
          <button type="button" onClick={dismiss} className="mt-2.5 text-[13px] font-semibold" style={{ color: "#B0541F" }}>
            Got it
          </button>
        </>
      )}
    </div>
  );
}
