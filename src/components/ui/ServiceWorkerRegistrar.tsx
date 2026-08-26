"use client";

// Registers the offline service worker (public/sw.js). Production only —
// a service worker during local dev makes stale-code debugging miserable.

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[Roam] Service worker registration failed:", err);
    });
  }, []);

  return null;
}
