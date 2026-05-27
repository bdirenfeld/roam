"use client";

import { useState, useTransition } from "react";
import { signInWithGoogle } from "@/lib/auth-actions";

const INK = "#1A1A2E";
const SIENNA = "#C4622D";
const PARCHMENT = "#FAF7F2";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

interface Props {
  image: { file: string; place: string; descriptor: string };
  errorMessage: string | null;
  next?: string;
}

export default function LoginScreen({ image, errorMessage, next }: Props) {
  const [isPending, startTransition] = useTransition();
  const [imgFailed, setImgFailed] = useState(false);

  const status: "idle" | "pending" | "error" = isPending
    ? "pending"
    : errorMessage
      ? "error"
      : "idle";

  function handleSignIn() {
    startTransition(() => signInWithGoogle(next));
  }

  return (
    <main>
      {/* ────────────────────────────────────────────────────────────
         MOBILE — unchanged from production
         ──────────────────────────────────────────────────────────── */}
      <div
        className="mobile-container md:hidden flex flex-col"
        style={{
          background: PARCHMENT,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Masthead */}
        <div style={{ padding: "24px 24px 18px" }}>
          <h1
            className="font-display italic"
            style={{
              fontWeight: 500,
              fontSize: "28px",
              lineHeight: 0.95,
              letterSpacing: "-0.015em",
              color: INK,
            }}
          >
            Roam
          </h1>
        </div>

        {/* Hairline rule */}
        <div style={{ margin: "0 24px", height: "1px", background: "rgba(26,26,46,0.18)" }} />

        {/* Photo plate — decorative; the caption conveys the place */}
        <div
          style={{
            margin: "20px 24px 14px",
            borderRadius: "12px",
            aspectRatio: "4 / 5",
            background: "#2a2620",
            overflow: "hidden",
          }}
        >
          {!imgFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/login/${image.file}`}
              alt=""
              onError={() => setImgFailed(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                display: "block",
              }}
            />
          )}
        </div>

        {/* Caption — paired to the photo, rotates with it */}
        <p
          className="font-display italic"
          style={{
            margin: "0 24px",
            fontWeight: 400,
            fontSize: "15px",
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
          }}
        >
          <span style={{ color: INK }}>{image.place}</span>
          <span style={{ color: INK }}> — </span>
          <span style={{ color: SIENNA }}>{image.descriptor}</span>
        </p>

        {/* Flexible spacer — pushes the CTA to the bottom */}
        <div className="flex-1" />

        {/* Error — single line, above the CTA, Ink (never Sienna for alarms) */}
        {status === "error" && (
          <p
            className="font-display italic"
            style={{ margin: "0 24px 14px", fontSize: "13px", color: INK }}
          >
            {errorMessage}
          </p>
        )}

        {/* CTA — Google OAuth, the only sign-in method */}
        <div style={{ margin: "0 24px" }}>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isPending}
            aria-busy={isPending}
            className="font-sans"
            style={{
              width: "100%",
              height: "54px",
              borderRadius: "12px",
              background: INK,
              color: PARCHMENT,
              fontWeight: 500,
              fontSize: "15px",
              letterSpacing: "-0.005em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <>
                <GoogleIcon />
                Continue with Google
              </>
            )}
          </button>
        </div>

        {/* Terms */}
        <p
          className="font-sans"
          style={{
            margin: "14px 24px 0",
            fontWeight: 400,
            fontSize: "11px",
            lineHeight: 1.55,
            color: "rgba(26, 26, 46, 0.55)",
            textAlign: "center",
          }}
        >
          By continuing, you accept Roam&apos;s{" "}
          {/* TODO: real legal URLs */}
          <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}>
            Terms
          </a>{" "}
          {/* TODO: real legal URLs */}
          and{" "}
          <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>

      {/* ────────────────────────────────────────────────────────────
         DESKTOP — editorial spread (md:+)
         Photo plate left, masthead + headline + CTA right.
         ──────────────────────────────────────────────────────────── */}
      <div
        className="hidden md:flex"
        style={{
          width: "100%",
          minHeight: "100dvh",
          background: PARCHMENT,
          color: INK,
        }}
      >
        {/* Left — photo plate */}
        <div
          style={{
            flex: "0 0 52%",
            background: "#2a2620",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {!imgFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/login/${image.file}`}
              alt=""
              onError={() => setImgFailed(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "50% 55%",
                display: "block",
              }}
            />
          )}
          {/* Bottom caption overlay — small-caps, parchment-toned */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "60px 40px 28px",
              background: "linear-gradient(180deg, rgba(26,26,46,0) 0%, rgba(26,26,46,0.55) 100%)",
            }}
          >
            <div
              className="font-sans"
              style={{
                fontSize: "10.5px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(250,247,242,0.92)",
              }}
            >
              {image.place} · {image.descriptor}
            </div>
          </div>
        </div>

        {/* Right — masthead + headline + CTA */}
        <div
          style={{
            flex: 1,
            padding: "64px 72px 56px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top row: wordmark + hairline rule */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
            <div
              className="font-display italic"
              style={{
                fontWeight: 500,
                fontSize: 38,
                color: INK,
                letterSpacing: "-0.015em",
                lineHeight: 1,
              }}
            >
              Roam
            </div>
            <div style={{ flex: 1, height: 1, background: RULE, marginTop: 8 }} />
          </div>

          {/* Small-caps subtitle */}
          <div
            className="font-sans"
            style={{
              fontSize: "10px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: CAPTION,
            }}
          >
            Trip planning simplified
          </div>

          {/* Headline deck */}
          <div style={{ marginTop: 80, maxWidth: 440 }}>
            <div
              className="font-display italic"
              style={{
                fontWeight: 400,
                fontSize: 34,
                lineHeight: 1.25,
                color: INK,
                letterSpacing: "-0.01em",
              }}
            >
              Plan with care.
              <br />
              Travel with curiosity.
            </div>
            <div
              className="font-sans"
              style={{
                marginTop: 18,
                fontSize: 14,
                lineHeight: 1.65,
                color: CAPTION,
                letterSpacing: "-0.005em",
              }}
            >
              Day-by-day itineraries, the places you mean to keep, and a thinking partner along for the ride.
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Error — Ink, single line above the CTA */}
          {status === "error" && (
            <div
              className="font-display italic"
              style={{
                maxWidth: 440,
                marginBottom: 14,
                fontSize: 13,
                color: INK,
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* CTA */}
          <div style={{ maxWidth: 440 }}>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isPending}
              aria-busy={isPending}
              className="font-sans"
              style={{
                width: "100%",
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: INK,
                color: PARCHMENT,
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {isPending ? (
                <Spinner />
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            {/* Terms */}
            <div
              className="font-sans"
              style={{
                marginTop: 14,
                fontSize: 12,
                lineHeight: 1.55,
                color: CAPTION,
                letterSpacing: "-0.005em",
              }}
            >
              By continuing, you accept Roam&apos;s{" "}
              {/* TODO: real legal URLs */}
              <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" }}>
                Terms
              </a>{" "}
              {/* TODO: real legal URLs */}
              and{" "}
              <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" }}>
                Privacy Policy
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path
        d="M12 2a10 10 0 0110 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
