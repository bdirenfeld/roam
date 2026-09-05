"use client";

// Unauthenticated arm of the claim route. signInWithGoogle sets the OAuth
// (PKCE) and `next` cookies, which can only happen inside a server action —
// so it must be triggered from the client (mirrors the landing page), never
// called during a server-component render. `next` carries this exact claim
// path so the invite resumes after login.

import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/auth-actions";
import { COMPANION_ENABLED } from "@/lib/featureFlags";

export interface InviteSummary {
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  cover: string | null;
  host: string | null;
}

function fmtRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return sameMonth
    ? `${m(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
    : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

export default function ClaimSignIn({ token, invite = null }: { token: string; invite?: InviteSummary | null }) {
  const [pending, startTransition] = useTransition();
  const range = invite ? fmtRange(invite.startDate, invite.endDate) : null;
  const firstName = invite?.host ? invite.host.split(" ")[0] : null;
  return (
    <main
      style={{ minHeight: "100dvh", background: "#F5F4F1" }}
      className="flex flex-col items-center justify-center px-8 text-center"
    >
      {/* The journey's cover, when it has one — the first thing a guest sees
          is the place, not a form. */}
      {invite?.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={invite.cover}
          alt=""
          className="w-full max-w-[420px] h-[180px] object-cover rounded-2xl mb-7"
          style={{ boxShadow: "0 8px 24px rgba(26,26,46,0.12)" }}
        />
      )}
      <p
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "rgba(26,26,46,0.5)" }}
      >
        {firstName ? `${firstName} invited you to` : "You're invited to"}
      </p>
      <h1
        className="font-display italic mt-3 text-[30px] leading-tight"
        style={{ color: "#1A1A2E", letterSpacing: "-0.01em" }}
      >
        {invite?.title ?? "a journey"}
      </h1>
      {(range || invite?.destination) && (
        <p className="mt-1.5 text-[13px]" style={{ color: "rgba(26,26,46,0.62)" }}>
          {[invite?.destination, range].filter(Boolean).join(" · ")}
        </p>
      )}
      <p
        className="mt-3 max-w-[34ch] text-[14px] leading-[1.6]"
        style={{ color: "rgba(26,26,46,0.62)" }}
      >
        {COMPANION_ENABLED
          ? "Sign in to view the itinerary and talk it through with your companion."
          : "Sign in to see the plan and the map."}
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
