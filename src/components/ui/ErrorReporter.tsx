"use client";

// Reports what the app couldn't handle: an uncaught error, or a promise that
// rejected with nobody listening. Mounted once in the app layout. Silent to
// the traveller — this is only so failures are recorded somewhere rather than
// vanishing on someone else's phone (scale audit, Sept 2026).
//
// Three guards, because an error loop must never become the problem: the same
// message is sent once per session, at most five per page load, and the POST
// itself never throws.

import { useEffect } from "react";

const MAX_PER_LOAD = 5;

// Noise, not faults. Anything matched here is dropped in the browser and never
// reaches /api/errors, so the log keeps only things worth reading.
//
// "Lock broken by another request with the 'steal' option" is supabase-js's
// auth lock doing exactly what it is designed to do: a second call for the same
// session takes the lock and the first is told so. It rejects with nobody
// listening, which makes it an unhandled rejection and lands it here. It was
// four of the twelve entries in the log — a third of it — for a condition that
// has never corresponded to anything going wrong (Sept 2026).
//
// Keep this list short and evidence-led: add a pattern only after seeing it in
// public.client_errors and establishing it is benign. A real fault silenced
// here is invisible.
const IGNORED = [/Lock broken by another request/i];

export default function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;

    const report = (kind: string, message: string, stack?: string) => {
      if (!message || sent >= MAX_PER_LOAD) return;
      if (IGNORED.some((re) => re.test(message))) return;
      const key = kind + "|" + message.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      void fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, stack, path: location.pathname }),
        keepalive: true,
      }).catch(() => { /* reporting must never make things worse */ });
    };

    const onError = (e: ErrorEvent) => report("error", e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      const message = typeof r === "string" ? r : r?.message ?? "Unhandled promise rejection";
      report("unhandledrejection", message, typeof r === "object" ? r?.stack : undefined);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
