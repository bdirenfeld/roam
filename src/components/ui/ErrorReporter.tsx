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

export default function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;

    const report = (kind: string, message: string, stack?: string) => {
      if (!message || sent >= MAX_PER_LOAD) return;
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
