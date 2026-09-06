"use client";

// The shared itinerary is rendered fresh on every request, so opening the
// link always shows the current plan. This covers the other case: the link
// left open on a phone while the host moves dinner. Coming back to the tab
// re-fetches the page (Brennan, Sept 2026: "does it update when we change
// the trip on the fly").
//
// A refresh only when the page becomes visible, never on a timer: a guest
// staring at the screen does not need it, and a poll would bill the host's
// database for tabs nobody is looking at.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      // Don't re-fetch on every alt-tab; once a minute at most.
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  return null;
}
