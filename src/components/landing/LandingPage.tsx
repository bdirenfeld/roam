"use client";

import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/auth-actions";

// ── Editorial palette (inline-hex convention, matching LoginScreen.tsx) ──
// Sienna is a decorative accent here only — the small hero rule and the section
// eyebrows. It is never used as an alarm/error color on this surface.
const INK = "#1A1A2E";
const SIENNA = "#C4622D";
const PARCHMENT = "#FAF7F2";
const INK_SOFT = "#3A3A4E";
const RULE = "rgba(26,26,46,0.10)";
const RULE_STRONG = "rgba(26,26,46,0.20)";
const CAPTION_SOFT = "rgba(26,26,46,0.40)";

// Parchment-toned inks for use over the dark hero photo / ink closing band.
const ON_DARK_BODY = "rgba(250,247,242,0.92)";
const ON_DARK_TERMS = "rgba(250,247,242,0.70)";
const ON_DARK_CAPTION = "rgba(250,247,242,0.85)";
const ON_DARK_PRICE = "rgba(250,247,242,0.55)";

// The three movements — numeral, italic word, body line, and the real app plate.
// Plates are static screenshots cropped to hide Android system chrome (top status
// bar + bottom nav bar) via object-position; only the app UI shows. `pos` tunes
// each crop's vertical origin: map/day land cleanly at 42%, but plan's header is
// taller, so it needs a lower origin (60%) to start the crop at the card list and
// avoid clipping mid-header (the "Fri, Jul 24" label + pagination dots).
const PHASES = [
  {
    n: "i",
    word: "Brainstorm",
    src: "/landing/screen-map.jpeg",
    pos: "50% 42%",
    line: "Throw down every place you might want to go. From a friend, a blog, a link — it all lands on one map.",
  },
  {
    n: "ii",
    word: "Decide",
    src: "/landing/screen-plan.jpeg",
    pos: "50% 60%",
    line: "Figure out what you'll actually do. Pull each place into a day, and watch the trip take shape.",
  },
  {
    n: "iii",
    word: "Go",
    src: "/landing/screen-day.jpeg",
    pos: "50% 42%",
    line: "Then just follow your agenda — each place in order, one day at a time.",
  },
];

export default function LandingPage() {
  const [isPending, startTransition] = useTransition();

  // Front-door sign-in — no `next`; the callback defaults to /trips, and the
  // existing has_paid gate routes unpaid users to /checkout. Flow unchanged.
  function handleSignIn() {
    startTransition(() => signInWithGoogle());
  }

  return (
    <main>
      {/* ════════════════════════════════════════════════════════════════
          MOBILE  (< md)
          ════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden" style={{ background: PARCHMENT, color: INK }}>
        {/* HERO — full-bleed photo, gateway content in the bottom overlay */}
        <div style={{ position: "relative", width: "100%", height: "min(100svh, 900px)" }}>
          <PlatePhoto src="/landing/hero-amalfi.jpg" position="50% 52%" />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(26,26,46,0.42) 0%, rgba(26,26,46,0.04) 30%, rgba(26,26,46,0.62) 100%)",
            }}
          />
          {/* masthead */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "24px 22px" }}>
            <Wordmark size={24} color={PARCHMENT} />
          </div>
          {/* gateway */}
          <div style={{ position: "absolute", left: 22, right: 22, bottom: 30 }}>
            <div style={{ width: 38, height: 2, background: SIENNA, borderRadius: 1, marginBottom: 16 }} />
            <h1
              className="font-display italic"
              style={{ fontWeight: 500, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.01em", color: PARCHMENT }}
            >
              Plan your own trip.
            </h1>
            <p
              className="font-sans"
              style={{ marginTop: 16, fontSize: 15.5, lineHeight: 1.58, letterSpacing: "-0.005em", color: ON_DARK_BODY }}
            >
              The things you want, the trip you&apos;ll love.
            </p>
            <div style={{ marginTop: 24 }}>
              <GoogleButton skin="light" full onClick={handleSignIn} pending={isPending} />
            </div>
            <div style={{ marginTop: 14 }}>
              <Terms color={ON_DARK_TERMS} />
            </div>
          </div>
          {/* caption */}
          <div style={{ position: "absolute", right: 16, bottom: 8 }}>
            <SmallCaps color={ON_DARK_CAPTION} size={9}>
              The Amalfi Coast · last light over Positano
            </SmallCaps>
          </div>
        </div>

        {/* HOW IT WORKS — stacked triptych */}
        <div style={{ padding: "52px 22px 40px" }}>
          <SmallCaps color={SIENNA} size={10}>
            How it works
          </SmallCaps>
          <h2
            className="font-display italic"
            style={{ marginTop: 14, marginBottom: 38, fontWeight: 500, fontSize: 30, lineHeight: 1.14, letterSpacing: "-0.01em" }}
          >
            Brainstorm, decide, go.
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
            {PHASES.map((p) => (
              <div key={p.word}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                  <span className="font-display italic" style={{ fontSize: 17, fontWeight: 500, color: SIENNA }}>
                    {p.n}
                  </span>
                  <span style={{ width: 32, height: 1, background: RULE, flex: "0 0 auto" }} />
                  <span className="font-display italic" style={{ fontSize: 21, fontWeight: 500, color: INK }}>
                    {p.word}
                  </span>
                </div>
                <p className="font-sans" style={{ marginBottom: 18, fontSize: 14.5, lineHeight: 1.6, letterSpacing: "-0.005em", color: INK_SOFT }}>
                  {p.line}
                </p>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ScreenPlate src={p.src} pos={p.pos} w={260} h={380} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CLOSING BAND — ink */}
        <div style={{ background: INK, padding: "48px 22px" }}>
          <h2
            className="font-display italic"
            style={{ fontWeight: 500, fontSize: 31, lineHeight: 1.14, letterSpacing: "-0.01em", color: PARCHMENT }}
          >
            Start with the next place you want to go.
          </h2>
          <div style={{ marginTop: 24 }}>
            <GoogleButton skin="light" full onClick={handleSignIn} pending={isPending} />
          </div>
          <p className="font-sans" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.5, textAlign: "center", color: ON_DARK_PRICE }}>
            $10, paid once after you sign in.
          </p>
          <div style={{ marginTop: 10 }}>
            <Terms color="rgba(250,247,242,0.62)" align="center" />
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ padding: "24px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark size={18} />
          <SmallCaps color={CAPTION_SOFT} size={9}>
            © Roam 2026
          </SmallCaps>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          DESKTOP  (md+)
          ════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block" style={{ background: PARCHMENT, color: INK }}>
        {/* HERO — full-bleed photograph, gateway card bottom-left */}
        <div style={{ position: "relative", width: "100%", height: "min(100svh, 900px)" }}>
          <PlatePhoto src="/landing/hero-amalfi.jpg" position="50% 52%" />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(26,26,46,0.40) 0%, rgba(26,26,46,0.05) 26%, rgba(26,26,46,0.12) 64%, rgba(26,26,46,0.48) 100%)",
            }}
          />
          {/* masthead */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "34px 56px" }}>
            <Wordmark size={28} color={PARCHMENT} />
          </div>
          {/* gateway card */}
          <div style={{ position: "absolute", left: 56, bottom: 64, width: 560, maxWidth: "calc(100% - 112px)" }}>
            <div style={{ width: 46, height: 2, background: SIENNA, borderRadius: 1, marginBottom: 26 }} />
            <h1
              className="font-display italic"
              style={{ fontWeight: 500, fontSize: 62, lineHeight: 1.04, letterSpacing: "-0.01em", color: PARCHMENT }}
            >
              Plan your&nbsp;own trip.
            </h1>
            <p
              className="font-sans"
              style={{ marginTop: 22, maxWidth: 470, fontSize: 18, lineHeight: 1.6, letterSpacing: "-0.005em", color: ON_DARK_BODY }}
            >
              The things you want, the trip you&apos;ll love.
            </p>
            <div style={{ marginTop: 34 }}>
              <GoogleButton skin="light" size="lg" onClick={handleSignIn} pending={isPending} />
            </div>
            <div style={{ marginTop: 16 }}>
              <Terms color={ON_DARK_TERMS} />
            </div>
          </div>
          {/* caption */}
          <div style={{ position: "absolute", right: 40, bottom: 30 }}>
            <SmallCaps color={ON_DARK_CAPTION} size={10}>
              The Amalfi Coast · last light over Positano
            </SmallCaps>
          </div>
        </div>

        {/* HOW IT WORKS — compressed triptych */}
        <div style={{ padding: "104px 56px 96px" }}>
          <div style={{ maxWidth: 760, marginBottom: 72 }}>
            <SmallCaps color={SIENNA} size={11}>
              How it works
            </SmallCaps>
            <h2
              className="font-display italic"
              style={{ marginTop: 18, fontWeight: 500, fontSize: 40, lineHeight: 1.12, letterSpacing: "-0.01em" }}
            >
              Brainstorm, decide, go.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 48 }}>
            {PHASES.map((p) => (
              <div key={p.word} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
                  <span className="font-display italic" style={{ fontSize: 20, fontWeight: 500, color: SIENNA }}>
                    {p.n}
                  </span>
                  <span style={{ width: 40, height: 1, background: RULE, flex: "0 0 auto" }} />
                  <span className="font-display italic" style={{ fontSize: 24, fontWeight: 500, color: INK }}>
                    {p.word}
                  </span>
                </div>
                <p className="font-sans" style={{ marginBottom: 22, fontSize: 15, lineHeight: 1.62, letterSpacing: "-0.005em", color: INK_SOFT }}>
                  {p.line}
                </p>
                <ScreenPlate src={p.src} pos={p.pos} w={300} h={440} />
              </div>
            ))}
          </div>
        </div>

        {/* CLOSING BAND — ink */}
        <div style={{ background: INK, padding: "92px 56px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 60, flexWrap: "wrap" }}>
            <h2
              className="font-display italic"
              style={{ maxWidth: 600, fontWeight: 500, fontSize: 46, lineHeight: 1.14, letterSpacing: "-0.01em", color: PARCHMENT }}
            >
              Start with the next place you want to go.
            </h2>
            <div style={{ flex: "0 0 auto" }}>
              <GoogleButton skin="light" size="lg" onClick={handleSignIn} pending={isPending} />
              <p className="font-sans" style={{ marginTop: 16, maxWidth: 320, fontSize: 12.5, lineHeight: 1.5, color: ON_DARK_PRICE }}>
                $10, paid once after you sign in.
              </p>
              <div style={{ marginTop: 10, maxWidth: 320 }}>
                <Terms color="rgba(250,247,242,0.62)" />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ padding: "34px 56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark size={20} />
          <SmallCaps color={CAPTION_SOFT} size={10}>
            © Roam 2026
          </SmallCaps>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local atoms — real app design system (font-display = Playfair italic,
// font-sans = DM Sans). No mockup inline-atom dependency.
// ─────────────────────────────────────────────────────────────────────

function Wordmark({ size = 28, color = INK }: { size?: number; color?: string }) {
  return (
    <span
      className="font-display italic"
      style={{ fontWeight: 500, fontSize: size, lineHeight: 0.95, letterSpacing: "-0.015em", color }}
    >
      Roam
    </span>
  );
}

function SmallCaps({ children, color, size = 10 }: { children: React.ReactNode; color: string; size?: number }) {
  return (
    <span
      className="font-sans"
      style={{ fontWeight: 500, fontSize: size, letterSpacing: "0.22em", textTransform: "uppercase", color }}
    >
      {children}
    </span>
  );
}

function Terms({ color, align = "left" }: { color: string; align?: "left" | "center" }) {
  // TODO: real legal URLs — Terms / Privacy as placeholder anchors for now.
  return (
    <p
      className="font-sans"
      style={{ fontSize: 11.5, lineHeight: 1.55, letterSpacing: "-0.003em", color, textAlign: align }}
    >
      By continuing you accept Roam&apos;s{" "}
      <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" }}>
        Terms
      </a>{" "}
      and{" "}
      <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" }}>
        Privacy Policy
      </a>
      .
    </p>
  );
}

// Full-bleed background photo plate (hero).
function PlatePhoto({ src, position }: { src: string; position: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#2a2620",
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: position,
      }}
    />
  );
}

// A framed Roam screen "plate" — portrait crop, hairline + soft shadow, 16px radius.
// The frame (radius + ruleStrong hairline + soft shadow) lives on the wrapper, which
// clips the image via overflow:hidden; the radius is mirrored onto the <img> so the
// image element itself also reports it. object-fit: cover on the portrait frame trims
// the tall screenshot's top status bar and bottom nav bar; `pos` sets the crop origin.
function ScreenPlate({ src, w, h, pos = "50% 42%" }: { src: string; w: number; h: number; pos?: string }) {
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
function GoogleButton({
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
