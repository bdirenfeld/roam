"use client";

// Sign-in is no longer the toll gate on a shared journey — it is an offer.
// Reading needs no account; signing in is how someone becomes a name on the
// journey and can add to it. Same OAuth call the claim page used, carrying
// this path so the invite resumes afterwards.

import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/auth-actions";

export default function JoinButton({ token, label = "Sign in to add to this journey" }: { token: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => signInWithGoogle(`/journey/${token}`))}
      disabled={pending}
      className="inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-medium disabled:opacity-50 active:scale-[0.99] transition-all"
      style={{ color: "#1A1A2E", boxShadow: "0 1px 2px rgba(26,26,46,0.06), 0 0 0 1px rgba(26,26,46,0.12)" }}
    >
      {pending ? "Taking you to Google…" : label}
    </button>
  );
}
