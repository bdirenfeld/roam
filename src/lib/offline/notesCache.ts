/**
 * Journey notes kept on the phone (4 Oct 2026). The ⋯ → Notes sheet fetched
 * them every time, so with no signal (a villa, a ferry) it opened empty — the
 * lockbox code included. Every read that succeeds is copied here; a read that
 * fails, or no signal at all, falls back to the copy. Wrapped: storage can be
 * missing or full, and that must never break opening the notes.
 */
const key = (tripId: string) => `roam:journey-notes:${tripId}`;

export function rememberNotes(tripId: string, notes: string | null | undefined, store: Storage | undefined = globalThis.localStorage): void {
  try { if (store && notes != null) store.setItem(key(tripId), notes); } catch { /* storage full or blocked */ }
}

export function recallNotes(tripId: string, store: Storage | undefined = globalThis.localStorage): string | null {
  try { return store?.getItem(key(tripId)) ?? null; } catch { return null; }
}
