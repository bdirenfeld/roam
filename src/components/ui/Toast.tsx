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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface ToastOptions {
  /** One sentence. "Card deleted", "Couldn't save. Try again." */
  message: string;
  /** Present → the pill grows an Undo button and stays for 6 s. */
  undo?: () => void | Promise<void>;
  /** Override the default lifetime in ms. */
  duration?: number;
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

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setCurrent(null);
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    keyRef.current += 1;
    setCurrent({ ...opts, key: keyRef.current });
    const life = opts.duration ?? (opts.undo ? 6000 : 3000);
    timerRef.current = setTimeout(() => setCurrent(null), life);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const handleUndo = async () => {
    const undo = current?.undo;
    dismiss();
    if (undo) await undo();
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <div
          key={current.key}
          role="status"
          aria-live="polite"
          className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white text-[13px] font-medium rounded-full shadow-lg flex items-center gap-3 animate-in fade-in"
          style={{ padding: current.undo ? "6px 6px 6px 16px" : "10px 16px", maxWidth: "calc(100vw - 32px)" }}
        >
          <span>{current.message}</span>
          {current.undo && (
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold transition-colors flex-shrink-0"
            >
              Undo
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
