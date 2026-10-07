"use client";

// Every day of an upcoming journey saved to the phone (7 Oct 2026, offline).
// A few seconds after the Day view opens online, the page hands the service
// worker every day's URL; the worker fetches each one into its page cache, so
// airplane mode can open any day, not only the ones already visited. Rules
// (the 30-day window, the 12-hour throttle, the message): lib/offline/saveDays.
// The worker side: public/sw.js, "roam:save-days".

import { useEffect } from "react";
import { localDate } from "@/lib/isSameLocalDay";
import { readSaved, saveDaysMessage, writeSaved } from "@/lib/offline/saveDays";

/** After first paint and the page's own loads: never competes with opening the day. */
export const SAVE_DAYS_DELAY_MS = 4000;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useSaveDaysOffline(
  tripId: string,
  start: string | null | undefined,
  end: string | null | undefined,
  days: { id: string; date: string }[],
  enabled: boolean,
) {
  // The day list only changes when days are added or moved; its ids are the key.
  const dayKey = days.map((d) => `${d.id}:${d.date}`).join(",");
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => {
      try {
        const worker = navigator.serviceWorker.controller;
        if (!worker || !navigator.onLine) return;
        const store = localStore();
        const last = readSaved(store, tripId);
        if (last === undefined) return;
        const now = Date.now();
        const message = saveDaysMessage({ tripId, start, end, todayISO: localDate(new Date()), days, lastSaved: last, now });
        if (!message || !writeSaved(store, tripId, now)) return;
        worker.postMessage(message);
      } catch {
        // A worker that isn't there or a storage error: the days opened so far stay saved.
      }
    }, SAVE_DAYS_DELAY_MS);
    return () => clearTimeout(timer);
    // days is read through dayKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, start, end, dayKey, enabled]);
}
