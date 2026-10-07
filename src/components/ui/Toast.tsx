"use client";

// ── The app's one toast ────────────────────────────────────────────────────
// Before this there were three: the Plan board's delete/undo bar, the Agenda's
// "Card deleted · Undo" pill, and the Companion's notice. Same pill, three
// timers, three sets of styles, and every new host (the Map, Ideas, Documents)
// got none of them — so deleting from those was instant and final while
// deleting from the Plan gave you six seconds (UX audit, Sep 2026, finding 2).
//
// One provider, mounted once in the app layout. Any component calls
// `useToast()` and shows a message, optionally with an Undo action. Showing a
// new toast replaces the old one; an Undo toast lives 6 s, a plain notice 3 s.
// The Undo handler runs once and the toast closes as soon as it is tapped.
//
// Except a toast that nobody's tap caused (7 Oct 2026, re-audit): `wait: true`
// queues it, one deep, until the toast on screen is gone. On a journey's eve
// "Isha joined Lisbon" and "Lisbon tomorrow · 2 still to book" both arrive on
// the first open; each marks itself seen, so the one replaced was lost for good.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface ToastOptions {
  /** One sentence. "Deleted Uffizi Gallery", "Couldn't save that. Try again." */
  message: string;
  /** Present → the pill grows an Undo button and stays for 6 s. */
  undo?: () => void | Promise<void>;
  /**
   * A button that is not Undo (7 Oct 2026, eve of departure): "Bookings" on
   * "Lisbon tomorrow · 2 still to book". Same pill, same 6 s, closes on tap.
   * Ignored when `undo` is present: one button per toast.
   */
  action?: { label: string; onClick: () => void };
  /** Override the default lifetime in ms. */
  duration?: number;
  /**
   * Nobody tapped anything to cause this (a "joined" or eve-of-departure notice):
   * wait for the toast on screen to go instead of replacing it. One deep — a
   * later waiting toast takes the place of an earlier one still waiting.
   * A toast without it (a delete, an error) still replaces at once.
   */
  wait?: boolean;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
  /** Dismiss whatever is showing — a host may want this before it unmounts. */
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { key: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);
  // Is a toast on screen right now? A ref, so toast() can decide synchronously.
  const showingRef = useRef(false);
  const waitingRef = useRef<ToastOptions | null>(null);
  const closeRef = useRef<() => void>(() => {});

  const show = useCallback((opts: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    keyRef.current += 1;
    showingRef.current = true;
    setCurrent({ ...opts, key: keyRef.current });
    const life = opts.duration ?? (opts.undo || opts.action ? 6000 : 3000);
    timerRef.current = setTimeout(() => closeRef.current(), life);
  }, []);

  // The toast on screen goes; a waiting one takes its place.
  const close = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    showingRef.current = false;
    setCurrent(null);
    const next = waitingRef.current;
    waitingRef.current = null;
    if (next) show(next);
  }, [show]);
  closeRef.current = close;

  const dismiss = close;

  const toast = useCallback((opts: ToastOptions) => {
    if (opts.wait && showingRef.current) {
      waitingRef.current = opts;
      return;
    }
    show(opts);
  }, [show]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const handleUndo = async () => {
    const undo = current?.undo;
    dismiss();
    if (undo) await undo();
  };

  const handleAction = () => {
    const action = current?.action;
    dismiss();
    action?.onClick();
  };
  const action = current && !current.undo ? current.action : undefined;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <div
          key={current.key}
          role="status"
          aria-live="polite"
          // On a computer the toast sits under the masthead (27 Sep 2026): at the
          // bottom it covered the centred sheets' own buttons — "Copy to 9 days"
          // sat under "Something to do before Spain" for seven seconds.
          className="fixed bottom-24 md:bottom-auto md:top-[76px] left-1/2 -translate-x-1/2 z-[80] max-w-[min(92vw,420px)] bg-gray-900 text-white text-[13px] font-medium rounded-2xl shadow-lg flex items-center gap-3 animate-in fade-in"
          style={{ padding: current.undo || action ? "6px 6px 6px 16px" : "10px 16px", maxWidth: "calc(100vw - 32px)" }}
        >
          <span>{current.message}</span>
          {current.undo && (
            <button
              type="button"
              onClick={handleUndo}
              className="relative px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold transition-colors flex-shrink-0"
            >
              {/* Out to the toast's own edges (its 6px padding) and 8px toward
                  the message: ~44px tall, never past the toast onto the page
                  under it (6 Oct 2026, taps audit). */}
              <span aria-hidden="true" data-testid="undo-target" className="absolute -inset-y-1.5 -right-1.5 -left-2" />
              Undo
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={handleAction}
              className="relative px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold transition-colors flex-shrink-0"
            >
              <span aria-hidden="true" className="absolute -inset-y-1.5 -right-1.5 -left-2" />
              {action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/**
 * The hook every host uses. Outside a provider (a stray render in a test, a
 * route that isn't under the app layout) it degrades to a no-op rather than
 * throwing, so a missing toast never takes a screen down with it.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { toast: () => {}, dismiss: () => {} };
}
