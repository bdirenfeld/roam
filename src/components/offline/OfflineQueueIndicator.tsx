"use client";

// ── "3 changes will sync" ─────────────────────────────────────────────────
//
// The honest bit of the offline story. Mounted once in the app layout, not per
// screen, so it is the same pill wherever you are in the journey.
//
// It appears only when there is something to say:
//   - queue non-empty              → "3 changes will sync" (or "Syncing…")
//   - a queued write was refused   → what was lost, once, plainly
// and disappears the moment the queue drains. No badge, no spinner, no
// permanent "offline mode" chrome.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudSlash, ArrowsClockwise, WarningCircle, X } from "@phosphor-icons/react";
import {
  dismissFailures,
  getState,
  subscribe,
  type QueueFailure,
  type QueueState,
} from "@/lib/offline/writeQueue";
import { startAutoSync } from "@/lib/offline/queuedWrite";

const EMPTY: QueueState = { pending: [], failures: [], syncing: false };

/** Column names, in the words the app uses for them. */
const FIELD_LABELS: Record<string, string> = {
  confirmed: "confirmed",
  start_time: "start time",
  end_time: "end time",
  position: "order",
  details: "details",
  day_id: "day",
  status: "status",
  place_id: "linked place",
};

function describe(failure: QueueFailure): string {
  const fields = Object.keys(failure.payload).map((k) => FIELD_LABELS[k] ?? k.replace(/_/g, " "));
  const what = fields.length ? fields.join(", ") : "a change";
  const noun = failure.table === "cards" ? "card" : failure.table.replace(/s$/, "");
  return `A ${noun}'s ${what} could not be saved.`;
}

export default function OfflineQueueIndicator() {
  const router = useRouter();
  const [state, setState] = useState<QueueState>(EMPTY);
  const [online, setOnline] = useState(true);
  const hadPending = useRef(false);

  // Queue state lives in localStorage, which does not exist on the server —
  // read it after mount, then follow it.
  useEffect(() => {
    setState(getState());
    const unsubscribe = subscribe(setState);
    const stopSync = startAutoSync();
    return () => {
      unsubscribe();
      stopSync();
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // When the queue empties, the service worker's page cache is still holding
  // the payload the server sent BEFORE the sync — so a later reload offline
  // would show pre-sync values with nothing left in the overlay to correct
  // them. One refresh re-fetches the RSC payload, which the worker re-caches.
  // Client state is preserved across a refresh, so nothing on screen jumps.
  useEffect(() => {
    const pendingNow = state.pending.length > 0;
    if (hadPending.current && !pendingNow) router.refresh();
    hadPending.current = pendingNow;
  }, [state.pending.length, router]);

  const onDismiss = useCallback(() => dismissFailures(), []);

  const count = state.pending.length;
  const failures = state.failures;
  if (count === 0 && failures.length === 0 && online) return null;

  return (
    <div
      className="fixed z-[65] left-4 right-4 bottom-[84px] flex flex-col items-center gap-2 pointer-events-none md:left-auto md:right-6 md:bottom-6 md:items-end"
      role="status"
      aria-live="polite"
    >
      {failures.length > 0 && (
        <div
          className="pointer-events-auto w-full md:w-[340px] rounded-xl bg-white px-3.5 py-3 flex items-start gap-2.5 animate-in fade-in"
          style={{
            border: "1px solid rgba(196,98,45,0.30)",
            boxShadow: "0 8px 30px rgba(26,26,46,0.14)",
          }}
        >
          <WarningCircle size={16} weight="light" className="mt-[1px] flex-shrink-0" color="#B0541F" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium leading-snug text-activity">
              {failures.length === 1
                ? "One change was not saved"
                : `${failures.length} changes were not saved`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {failures.slice(-3).map((f) => (
                <li key={f.id} className="text-[11px] leading-snug text-activity/60">
                  {describe(f)}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] leading-snug text-activity/45">
              The server refused it, so it was discarded rather than retried. Make the edit again.
            </p>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded-md text-activity/40 hover:text-activity hover:bg-[rgba(26,26,46,0.05)] transition-colors"
          >
            <X size={13} weight="light" />
          </button>
        </div>
      )}

      {!online && count === 0 && (
        <div
          className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 py-1.5 animate-in fade-in"
          style={{
            border: "1px solid rgba(26,26,46,0.12)",
            boxShadow: "0 4px 16px rgba(26,26,46,0.10)",
          }}
        >
          <CloudSlash size={13} weight="light" color="#1A1A2E" />
          <span className="text-[11px] font-medium leading-none text-activity/70">
            You&rsquo;re offline. Changes will sync when you&rsquo;re back.
          </span>
        </div>
      )}

      {count > 0 && (
        <div
          className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 py-1.5 animate-in fade-in"
          style={{
            border: "1px solid rgba(26,26,46,0.12)",
            boxShadow: "0 4px 16px rgba(26,26,46,0.10)",
          }}
        >
          {state.syncing && online ? (
            <ArrowsClockwise size={13} weight="light" className="animate-spin" color="#1A1A2E" />
          ) : (
            <CloudSlash size={13} weight="light" color="#1A1A2E" />
          )}
          <span className="text-[11px] font-medium leading-none text-activity/70 tabular-nums">
            {state.syncing && online
              ? `Syncing ${count} ${count === 1 ? "change" : "changes"}…`
              : `${count} ${count === 1 ? "change" : "changes"} will sync`}
          </span>
        </div>
      )}
    </div>
  );
}
