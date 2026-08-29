"use client";

import { useCallback, useRef } from "react";

/**
 * Drag a bottom sheet down to dismiss it, from anywhere on the sheet.
 *
 * Every sheet in Roam has a grab handle, and the handle turned out to be
 * decoration: the sheets built after CardBottomSheet drew one and bound no
 * gesture to it, so the only way out was a button. On a phone, pulling a sheet
 * down is how you close it — a handle you can't pull is a lie.
 *
 * The numbers match CardBottomSheet exactly, so every sheet feels the same:
 * claim the gesture only when the content is already scrolled to the top
 * (otherwise a downward swipe means "scroll up"), lock the axis after a little
 * travel so a horizontal drag is left alone, and dismiss past 120px.
 *
 * touchcancel matters. Android fires it readily — the scroller claims the
 * gesture, a second finger lands, the system interrupts — and without handling
 * it the inline transform written during the drag stays on the element with
 * `transition: none`, leaving the sheet frozen wherever the finger stopped and
 * never closing.
 */
const DISMISS_PX = 120;
const AXIS_LOCK_PX = 8;

export function useSheetDrag(
  onClose: () => void,
  /** The element that scrolls, when it isn't the sheet itself. CardBottomSheet
   *  scrolls an inner body under a pinned hero, so asking the sheet for its own
   *  scrollTop there would always read 0 and claim every downward swipe. */
  scrollRef?: React.RefObject<HTMLElement | null>
) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  const axis = useRef<"pending" | "vertical" | "horizontal">("pending");
  const dragging = useRef(false);
  const startedAtTop = useRef(true);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = "pending";
    dragging.current = false;
    // Mid-scroll, a downward swipe means "scroll up", not "close".
    const scroller = scrollRef?.current ?? sheetRef.current;
    startedAtTop.current = (scroller?.scrollTop ?? 0) <= 0;
  }, [scrollRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!sheetRef.current || !startedAtTop.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (axis.current === "pending") {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        axis.current = "horizontal";
        return;
      }
      axis.current = "vertical";
      dragging.current = true;
    }
    if (axis.current !== "vertical" || !dragging.current) return;
    // Downward only — dragging up shouldn't lift the sheet off its edge.
    sheetRef.current.style.transform = `translateY(${Math.max(0, dy)}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const settle = useCallback((dy: number) => {
    const el = sheetRef.current;
    if (!el) return;
    if (dy > DISMISS_PX) {
      el.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      el.style.transform = "translateY(100%)";
      setTimeout(onClose, 240);
      return;
    }
    el.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
    el.style.transform = "translateY(0)";
  }, [onClose]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const wasVertical = axis.current === "vertical" && dragging.current;
    axis.current = "pending";
    dragging.current = false;
    if (!wasVertical) return;
    settle(e.changedTouches[0].clientY - startY.current);
  }, [settle]);

  const onTouchCancel = useCallback(() => {
    axis.current = "pending";
    if (!dragging.current) return;
    dragging.current = false;
    settle(0); // spring back — a cancelled gesture is not a dismissal
  }, [settle]);

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
