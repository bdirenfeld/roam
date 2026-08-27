"use client";

// ── Overlay — the app's one modal shell ───────────────────────────────────
// Brennan, Aug 2026: "the less times we move someone to a different page the
// better." Plan a journey, Profile and Trip settings are still real routes —
// a bookmark or a shared link has to render the full page — but every in-app
// trigger now opens the same screen in place, over whatever you were doing.
//
// One shell, two shapes:
//  • under md — a near-full-height bottom sheet with the app's standard drag
//    handle and swipe-to-dismiss (same numbers as plan/DocumentsSheet and the
//    useSheetDrag in trips/YearView: 120px throw, the two easing curves).
//  • md and up — a centred card at 620px in the app's border/shadow language.
//
// The shell owns chrome only: backdrop, sizing, dismissal, focus and scroll
// lock. The screen inside knows nothing about being in an overlay — it brings
// its own header and its own scrolling region, exactly as it does on its page.
//
// ── Why there is no transform on the card ─────────────────────────────────
// All three screens open nested sheets of their own (date picker, cover URL,
// delete confirm) which are `position: fixed`. A transform, `translate` or
// `will-change: transform` on an ancestor makes that ancestor the containing
// block, so those sheets would be measured against — and clipped by — this
// card instead of the viewport. So the desktop card is centred with flexbox,
// not `left-1/2 -translate-x-1/2`, `will-change` is never set at rest, and the
// entrance animation is a short transform that has finished long before any
// nested sheet can be opened.
//
// Belt and braces on top of that: those nested sheets are sized in percent
// (`max-height: 85%`), not vh. Against the viewport that is identical to the
// old `85vh`; if a transform ever does win — mid-animation, or mid-drag on a
// phone — they resize to the card instead of overflowing it. Either containing
// block renders something sensible, so the layout never depends on winning
// that argument.
//
// ── Mobile keyboard ───────────────────────────────────────────────────────
// The sheet is sized in dvh, never vh: on iOS Safari `100vh` is the *largest*
// viewport (URL bar hidden), so a vh-sized sheet already runs under the
// browser chrome before a keyboard is involved. `92dvh` tracks the real
// visible height.
//
// The keyboard itself is handled by geometry, not by measuring it. iOS does
// not resize the layout viewport when the keyboard opens, so no height
// computed here could "avoid" it; what Safari does do is scroll the nearest
// scrollable ancestor to bring the focused field into view. That only works
// when the fields sit in a scroller with somewhere to go — hence the contract
// with the hosted screen:
//   • the screen is a flex column: a flex-shrink-0 header and a
//     `flex-1 min-h-0 overflow-y-auto` body, with every text input in the body;
//   • that body carries deep bottom padding, so the last field can still be
//     scrolled clear of a half-screen keyboard rather than bottoming out
//     behind it;
//   • 92dvh rather than 100dvh keeps the sheet's own top edge (and so the drag
//     handle) on screen with the keyboard up.
// Not verified on a physical handset — this is reasoned, not measured.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Everything that can hold focus inside the overlay, for the Tab cycle. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Marks a sheet opened *inside* an overlay (date picker, cover URL, delete
 * confirm). While one is on screen it owns Escape — see the handler below.
 * Spread onto the nested sheet's own root element.
 */
export const NESTED_SHEET_ATTR = { "data-overlay-nested": "true" } as const;

/** True while a nested sheet is mounted anywhere on the page. */
function nestedSheetOpen(): boolean {
  return !!document.querySelector('[data-overlay-nested="true"]');
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Props {
  /** Dismiss — backdrop click, Escape, and the mobile swipe all call this. */
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
  /** Desktop card width. 620px is the app's form measure. */
  widthClassName?: string;
}

export default function Overlay({
  onClose,
  label,
  children,
  widthClassName = "md:w-[620px]",
}: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragY = useRef(0);
  const dragging = useRef(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // The overlay is mounted only while open (the providers render it
  // conditionally), so mount/unmount is the whole lifecycle — no `open` prop
  // and no stale-effect ordering to get wrong.

  // Body scroll lock — the overlay's own body is what scrolls.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus moves onto the dialog on open and back to the trigger on close.
  // The dialog itself takes focus rather than the first field: on a phone,
  // focusing an input would throw the keyboard up before the traveller has
  // even seen the screen.
  useEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      const back = returnFocusTo.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []);

  // Escape closes; Tab cycles inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // A nested sheet owns Escape first — it closes on its own listener.
        // Without this guard one keypress would close both, and the traveller
        // would lose the whole screen when they meant to back out of a picker.
        if (nestedSheetOpen()) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = sheetRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Drag-to-dismiss (under md only) ─────────────────────────────────────
  // The width guard keeps a stray touch on a touch laptop from writing an
  // inline transform onto the desktop card.
  const onTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    dragY.current = e.touches[0].clientY;
    dragging.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    const reduced = prefersReducedMotion();
    if (dy > 120) {
      if (reduced) {
        onClose();
        return;
      }
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = reduced
        ? "none"
        : "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform = "translateY(0)";
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6"
      // Belt and braces: the backdrop below covers the whole container, so a
      // click only reaches here if it landed on the container itself. A click
      // inside the card stops at the card — it is a sibling of the backdrop,
      // not a child, so it never triggers either handler.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-black/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={[
          "relative flex flex-col overflow-hidden bg-white outline-none",
          // Mobile: bottom sheet. 92dvh — see the keyboard note at the top.
          "w-full max-w-mobile h-[92dvh] rounded-t-2xl shadow-sheet",
          // Desktop: centred card in the app's border/shadow language.
          "md:h-auto md:max-h-[86vh] md:max-w-full md:rounded-2xl",
          "md:border md:border-black/[0.07] md:shadow-[0_12px_44px_rgba(26,26,46,0.20)]",
          widthClassName,
          // Under md the sheet rises from the bottom, the app's standard sheet
          // entrance; a centred card should not fly up off the screen edge, so
          // md gets a short lift instead. Reduced motion drops both —
          // motion-safe: is Tailwind's own prefers-reduced-motion guard.
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
          "motion-safe:slide-in-from-bottom md:motion-safe:slide-in-from-bottom-2",
        ].join(" ")}
      >
        {/* Handle — carries the swipe. Mobile only; on desktop there is no
            gesture to hint at and the card has no grab affordance. */}
        <div
          className="flex justify-center pt-2.5 pb-1 flex-shrink-0 md:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {children}
      </div>
    </div>
  );
}
