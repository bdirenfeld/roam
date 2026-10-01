"use client";

import { useEffect } from "react";
import type { Card, Trip } from "@/types/database";
import { findBases, FIND_CATEGORIES } from "@/lib/find/gaps";
import { findRequest, warmPlan } from "@/lib/find/request";

/**
 * Find, ready before it is opened (30 Sep 2026). A first search of a city and
 * category waits 30 seconds or more for the travellers' picks (Claude reading
 * Reddit and blogs); Google's half is a second. Opening a journey searches
 * every category for its main bases in the background, three at a time, so
 * the server's month-long shared cache has them when Find opens. Brennan
 * agreed the cost (about 50 cents an area a month). Once a day per journey
 * per browser; a cached answer costs nothing.
 */
const CONCURRENCY = 3;
const STARTED = new Set<string>();

export function useWarmFind(trip: Pick<Trip, "id" | "end_date"> & Partial<Trip>, cards: Card[], enabled = true): void {
  useEffect(() => {
    if (!enabled || STARTED.has(trip.id)) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `roam:find-warm:${trip.id}`;
    try { if (window.localStorage.getItem(key) === today) return; } catch { /* storage blocked */ }
    const bases = findBases(cards, trip as Trip);
    const jobs = warmPlan(bases, FIND_CATEGORIES.map((c) => c.subType), trip.end_date ?? null, today);
    if (!jobs.length) return;
    STARTED.add(trip.id);
    try { window.localStorage.setItem(key, today); } catch { /* storage blocked */ }
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        try {
          await fetch("/api/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(findRequest(trip.id, j.base, j.subType, j.mode)) });
        } catch { /* the sheet will ask again */ }
      }
    };
    // After the page has settled, so it never competes with what is on screen.
    const t = window.setTimeout(() => { for (let i = 0; i < CONCURRENCY; i++) void worker(); }, 4000);
    // Left before it began: let the next visit start it. Once begun, it runs on
    // in the background while the page is open.
    return () => {
      window.clearTimeout(t);
      if (next === 0) { STARTED.delete(trip.id); try { window.localStorage.removeItem(key); } catch { /* storage blocked */ } }
    };
    // Once per journey: cards change as the person works, the bases do not need to follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, enabled]);
}
