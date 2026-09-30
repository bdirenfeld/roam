/**
 * A lazy-loaded screen after a deploy (30 Sep 2026). Plan my trip and Find
 * load when first opened (next/dynamic). A page opened before a deploy asks
 * for the old build's file, which is gone, and React showed "Application
 * error" — Brennan pressed Plan my trip and got a blank page. A missing chunk
 * now reloads the page once (not twice within a minute, so a real outage
 * cannot loop), which brings the new build; the button then works.
 */

export function isChunkError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  const text = `${err?.name ?? ""} ${err?.message ?? String(e)}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
}

const KEY = "roam:chunk-reload";

/** Whether to reload now: not if the last reload for this was under a minute ago. */
export function shouldReload(last: number | null, now: number): boolean {
  return last === null || now - last > 60_000;
}

export function reloadOnStale<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().catch((e) => {
    if (typeof window !== "undefined" && isChunkError(e)) {
      let last: number | null = null;
      try { const v = window.sessionStorage.getItem(KEY); last = v ? Number(v) : null; } catch { /* storage blocked */ }
      if (shouldReload(last, Date.now())) {
        try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
        window.location.reload();
        return new Promise<T>(() => {});
      }
    }
    throw e;
  });
}
