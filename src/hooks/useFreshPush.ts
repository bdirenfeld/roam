"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Open a page after a write, with the write on it (2 Oct 2026).
 *
 * Next 14's router keeps every page it has shown or prefetched for 30 s (5 min
 * for `router.prefetch`, which the phone's day does for the days either side),
 * and `router.push` serves that copy without asking the server. So a push to a
 * day straight after Plan my trip wrote cards onto it showed the day as it was
 * before: Brennan's Romania day 1 had been prefetched 14 s earlier, and the
 * Vercel log has no request for it between the insert and his pull-to-refresh.
 *
 * `router.refresh()` empties that cache, but a push made while it is in
 * flight discards it (navigations take priority in the router's queue). So:
 * refresh, wait until the host's server data has come back (`data` changes
 * identity, and `ready` agrees, e.g. the new cards are in it), then push,
 * which now has nothing stale to serve. If the refresh never lands (offline),
 * push anyway after `fallbackMs`.
 */
export function useFreshPush<T>(data: T, fallbackMs = 5000): (href: string, ready?: (data: T) => boolean) => void {
  const router = useRouter();
  const pending = useRef<{ href: string; from: T; ready?: (data: T) => boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  const latest = useRef(data); latest.current = data;

  useEffect(() => {
    const p = pending.current;
    if (!p || data === p.from || (p.ready && !p.ready(data))) return;
    clearTimeout(p.timer);
    pending.current = null;
    router.push(p.href);
  }, [data, router]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer); }, []);

  return useCallback((href: string, ready?: (data: T) => boolean) => {
    if (pending.current) clearTimeout(pending.current.timer);
    const timer = setTimeout(() => { pending.current = null; router.push(href); }, fallbackMs);
    pending.current = { href, from: latest.current, ready, timer };
    router.refresh();
  }, [router, fallbackMs]);
}
