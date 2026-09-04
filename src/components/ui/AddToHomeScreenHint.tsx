"use client";

// One-time "Add to Home Screen" hint for iPhone/iPad visitors in Safari.
// Renders nothing when: not iOS Safari, already running from the home screen
// (standalone), or previously dismissed. Mirrors the map intro card pattern:
// quiet, dismissible, localStorage-gated.

import { useEffect, useState } from "react";

const DISMISS_KEY = "roam_a2hs_hint_v1";

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  // Chrome/Firefox/Edge on iOS have their own share layouts — the
  // instructions below would point at the wrong button there.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && !isOtherBrowser;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, not in the TS lib
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function AddToHomeScreenHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!isIosSafari() || isStandalone()) return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="md:hidden mx-0 mb-5 bg-white rounded-2xl border border-gray-100 shadow-sheet px-5 py-4">
      <p className="text-[14px] font-semibold text-gray-900">
        Put Roam on your home screen
      </p>
      <p className="text-[13px] text-gray-500 leading-[1.55] mt-1">
        Tap the Share button
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="inline-block mx-1 -mt-0.5 text-gray-600"
        >
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        at the bottom of the screen, then choose{" "}
        <span className="font-semibold text-gray-700">
          &ldquo;Add to Home Screen&rdquo;
        </span>
        . Roam becomes an app icon — no download needed.
      </p>
      <button
        onClick={() => {
          setShow(false);
          localStorage.setItem(DISMISS_KEY, "1");
        }}
        className="mt-2.5 text-[13px] font-semibold text-[#B0541F]"
      >
        Got it
      </button>
    </div>
  );
}
