"use client";

import { FUNNEL, funnelEvent } from "@/lib/funnel";

// Atoms and constants shared by the landing page (and its tests).
// ── Editorial palette (inline-hex convention, matching LoginScreen.tsx) ──
// Sienna is a decorative accent here only — the small hero rule and the section
// eyebrows. It is never used as an alarm/error color on this surface.
export const INK = "#1A1A2E";
export const SIENNA = "#B0541F";
export const PARCHMENT = "#F5F4F1";
export const INK_SOFT = "#3A3A4E";
export const RULE_STRONG = "rgba(26,26,46,0.20)";
export const CAPTION_SOFT = "rgba(26,26,46,0.40)";

// Parchment-toned inks for use over the dark hero photo / ink closing band.

// The real, finished journey a visitor can read without an account (10 Oct 2026,
// landing audit: the only door was "Continue with Google", so a stranger from
// Instagram never saw the product before the account wall). The shared page is
// public and read-only. Swap the token to show a different journey.
export const DEMO_JOURNEY = { href: "/journey/d9cf693ad5e4", label: "New York, 4 days" };

// The three movements — numeral, italic word, body line, and the real app plate.
// Plates are phone-width captures of the live app (26 Sep 2026, Rome April 2026 —
// public places only, no villa or future dates on a public page), taken from a
// 430px Chrome window, so there is no phone chrome to hide. `pos` picks the part
// of each tall capture the portrait plate shows: the map's cluster of pins, the
// picked pin with its tray of days at the bottom, and the day from its header.
export const PHASES = [
  {
    n: "i",
    word: "Brainstorm",
    src: "/landing/screen-map.jpeg",
    pos: "50% 55%",
    line: "Throw down every place you might want to go. From a friend, a blog, a link — it all lands on one map.",
  },
  {
    n: "ii",
    word: "Decide",
    src: "/landing/screen-plan.jpeg",
    pos: "50% 100%",
    line: "Figure out what you'll actually do. Pull each place into a day, and watch the trip take shape.",
  },
  {
    n: "iii",
    word: "Go",
    src: "/landing/screen-day.jpeg",
    pos: "50% 0%",
    line: "Then just follow your agenda — each place in order, one day at a time.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Local atoms — real app design system (font-display = Playfair italic,
// font-sans = DM Sans). No mockup inline-atom dependency.
// ─────────────────────────────────────────────────────────────────────

export function Wordmark({ size = 28, color = INK }: { size?: number; color?: string }) {
  return (
    <span
      className="font-display italic"
      style={{ fontWeight: 500, fontSize: size, lineHeight: 0.95, letterSpacing: "-0.015em", color }}
    >
      Roam
    </span>
  );
}

export function SmallCaps({ children, color, size = 10 }: { children: React.ReactNode; color: string; size?: number }) {
  return (
    <span
      className="font-sans"
      style={{ fontWeight: 500, fontSize: size, letterSpacing: "0.22em", textTransform: "uppercase", color }}
    >
      {children}
    </span>
  );
}

// Under the Google button: the Instagram bio says "Try it free"; the page
// never did, and a stranger wonders what it costs before handing over an account.
export function FreeLine({ color }: { color: string }) {
  return (
    <p className="font-sans" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, letterSpacing: "-0.003em", color }}>
      Free. No card.
    </p>
  );
}

// The two doors that need no account: a real finished journey (the public
// shared page) and the static quick-start guide (/public/guide.html).
export function Doors({ color }: { color: string }) {
  const link = { textDecoration: "underline", textUnderlineOffset: 3, color: "inherit" } as const;
  return (
    <div className="font-sans" style={{ letterSpacing: "-0.003em", color }}>
      <p style={{ fontSize: 14.5, lineHeight: 1.5 }}>
        <a href={DEMO_JOURNEY.href} style={link} onClick={() => funnelEvent(FUNNEL.landingDemo)}>See a real trip</a>
        <span style={{ opacity: 0.75 }}> · {DEMO_JOURNEY.label}</span>
      </p>
      <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, opacity: 0.75 }}>
        New here? <a href="/guide.html" style={link}>Read the five-minute guide</a>.
      </p>
    </div>
  );
}

// Terms/Privacy line removed (Brennan, Aug 26) — no real legal docs exist yet.
// When they do, add a Terms component back under each GoogleButton, beside GuideLink.

// A framed Roam screen "plate" — portrait crop, hairline + soft shadow, 16px radius.
// The frame (radius + ruleStrong hairline + soft shadow) lives on the wrapper, which
// clips the image via overflow:hidden; the radius is mirrored onto the <img> so the
// image element itself also reports it. object-fit: cover on the portrait frame trims
// the tall screenshot's top status bar and bottom nav bar; `pos` sets the crop origin.
export function ScreenPlate({ src, w, h, pos = "50% 42%" }: { src: string; w: number; h: number; pos?: string }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${RULE_STRONG}`,
        boxShadow: "0 1px 2px rgba(26,26,46,0.04), 0 24px 50px -28px rgba(26,26,46,0.32)",
        background: PARCHMENT,
        flex: "0 0 auto",
        maxWidth: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, borderRadius: 16, display: "block" }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Google CTA — the single conversion verb. Light skin = white surface,
// ink text, hairline border (reads cleanly on the dark photo / ink band).
// ─────────────────────────────────────────────────────────────────────
export function GoogleButton({
  skin = "light",
  size = "md",
  full = false,
  onClick,
  pending,
}: {
  skin?: "light" | "dark";
  size?: "md" | "lg";
  full?: boolean;
  onClick: () => void;
  pending: boolean;
}) {
  const dark = skin === "dark";
  const h = size === "lg" ? 58 : 54;
  const fs = size === "lg" ? 16 : 15;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className="font-sans"
      style={{
        width: full ? "100%" : "auto",
        height: h,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: dark ? INK : "#fff",
        color: dark ? PARCHMENT : INK,
        border: dark ? "none" : `1px solid ${RULE_STRONG}`,
        borderRadius: 12,
        padding: full ? 0 : "0 28px",
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? (
        <Spinner color={dark ? PARCHMENT : INK} />
      ) : (
        <>
          <GoogleIcon size={fs + 3} />
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );
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

function Spinner({ color }: { color: string }) {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" opacity="0.3" />
      <path d="M12 2a10 10 0 0110 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
