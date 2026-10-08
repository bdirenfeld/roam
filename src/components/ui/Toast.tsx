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

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toastPlacement, type ToastPlacement } from "@/lib/ui/toastPlacement";

/** Sheets and overlays sit at z-60 and up (the BottomNav is 50, the full-screen map 55). */
const SHEET_Z = 60;

/**
 * The top edge of the bottom sheet open on a phone, or null. Every sheet in the
 * app is a `position: fixed` layer at z-60+ with its panel pinned to the bottom,
 * but they do not share a role or class — so this asks the page what is at the
 * bottom-centre of the screen. From that element up to its fixed layer, the
 * tallest box that is not full-screen is the panel. offsetHeight, not the rect,
 * so a sheet mid slide-in or mid-drag reads at its resting height.
 */
export function openSheetTop(toastLane: HTMLElement | null): number | null {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  const vh = window.innerHeight;
  const hits = document.elementsFromPoint(window.innerWidth / 2, vh - 2);
  const hit = hits.find((el) => !toastLane?.contains(el));
  if (!(hit instanceof HTMLElement)) return null;
  let panel: HTMLElement | null = null;
  for (let el: HTMLElement | null = hit; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (s.position === "fixed") {
      const z = Number.parseInt(s.zIndex, 10);
      if (!(z >= SHEET_Z)) return null;
      // The layer itself is the panel when it is not full-screen (a fixed bottom sheet).
      if (el.offsetHeight > 0 && el.offsetHeight < vh - 4) panel = el;
      return panel ? vh - panel.offsetHeight : null;
    }
    if (el.offsetHeight > 0 && el.offsetHeight < vh - 4) panel = el;
  }
  return null;
}

/**
 * The top edge of the highest on-screen control marked `data-toast-clear` (the
 * Map's bottom row, which rides above Find's half sheet and grows the Filter's
 * pills upward), or null. The toast stands above it (lib/ui/toastPlacement).
 */
export function toastClearTop(): number | null {
  if (typeof document === "undefined") return null;
  let top: number | null = null;
  document.querySelectorAll<HTMLElement>("[data-toast-clear]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= window.innerHeight) return;
    top = top == null ? r.top : Math.min(top, r.top);
  });
  return top;
}

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

  // Off an open sheet's footer (7 Oct 2026, phone harness): "Car: booked · Undo"
  // sat on "Book 2 on Kayak". Measured while a toast is up, and again whenever
  // the page changes under it (a sheet opens, or grows a row) or the window resizes.
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<ToastPlacement>(null);
  const showing = current != null;
  useLayoutEffect(() => {
    if (!showing) { setPlacement(null); return; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const lane = laneRef.current;
      const pill = lane?.firstElementChild as HTMLElement | null | undefined;
      const next = toastPlacement({
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        sheetTop: openSheetTop(lane ?? null),
        toastH: pill?.offsetHeight ?? 0,
        clearTop: toastClearTop(),
      });
      setPlacement((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(later) : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", later);
    return () => {
      mo?.disconnect();
      window.removeEventListener("resize", later);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showing, current?.key]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        // The lane: the full width minus 16px gutters, the pill centred in it
        // (7 Oct 2026, phone harness). The pill used to be `left-1/2
        // -translate-x-1/2`, which gives a fixed box only the right half of the
        // screen to grow into, so "Lisbon tomorrow · 2 still to book" wrapped to
        // four lines at 375px. The lane takes no taps; the pill does.
        <div
          key={current.key}
          ref={laneRef}
          data-testid="toast-lane"
          // On a computer the toast sits under the masthead (27 Sep 2026): at the
          // bottom it covered the centred sheets' own buttons — "Copy to 9 days"
          // sat under "Something to do before Spain" for seven seconds.
          className="fixed inset-x-4 bottom-24 md:bottom-auto md:top-[76px] z-[80] flex justify-center pointer-events-none"
          style={placement ? ("top" in placement ? { top: placement.top, bottom: "auto" } : { bottom: placement.bottom }) : undefined}
        >
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto max-w-[420px] bg-gray-900 text-white text-[13px] font-medium rounded-2xl shadow-lg flex items-center gap-3 animate-in fade-in"
          style={{ padding: current.undo || action ? "6px 6px 6px 16px" : "10px 16px" }}
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
