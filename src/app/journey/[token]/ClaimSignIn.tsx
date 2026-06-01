"use client";

// Unauthenticated arm of the claim route. signInWithGoogle sets the OAuth
// (PKCE) and `next` cookies, which can only happen inside a server action —
// so it must be triggered from the client (mirrors the landing page), never
// called during a server-component render. `next` carries this exact claim
// path so the invite resumes after login.

import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/auth-actions";

export default function ClaimSignIn({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <main
      style={{ minHeight: "100dvh", background: "#FAF7F2" }}
      className="flex flex-col items-center justify-center px-8 text-center"
    >
      <p
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "rgba(26,26,46,0.5)" }}
      >
        Roam
      </p>
      <h1
        className="font-display italic mt-3 text-[26px]"
        style={{ color: "#1A1A2E", letterSpacing: "-0.01em" }}
      >
        You&apos;ve been invited to a journey
      </h1>
      <p
        className="mt-3 max-w-[34ch] text-[14px] leading-[1.6]"
        style={{ color: "rgba(26,26,46,0.55)" }}
      >
        Sign in to view the itinerary and talk it through with your companion.
      </p>
      <button
        onClick={() => startTransition(() => signInWithGoogle(`/journey/${token}`))}
        disabled={pending}
        className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3 text-[14px] font-medium disabled:opacity-50 active:scale-[0.99] transition-all"
        style={{
          color: "#1A1A2E",
          boxShadow: "0 1px 2px rgba(26,26,46,0.06), 0 0 0 1px rgba(26,26,46,0.12)",
        }}
      >
        {pending ? "Taking you to Google…" : "Continue with Google"}
      </button>
    </main>
  );
}
