import { useRef, useCallback } from 'react'

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  maxVerticalDrift?: number
  disabled?: boolean
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  maxVerticalDrift = 80,
  disabled = false,
}: SwipeOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const cancelled = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    cancelled.current = false
  }, [disabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || cancelled.current) return
    const dy = Math.abs(e.touches[0].clientY - touchStart.current.y)
    if (dy > maxVerticalDrift) {
      cancelled.current = true
      touchStart.current = null
    }
  }, [maxVerticalDrift])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || cancelled.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    touchStart.current = null
    if (Math.abs(dx) < threshold) return
    if (dx < 0 && onSwipeLeft) onSwipeLeft()
    if (dx > 0 && onSwipeRight) onSwipeRight()
  }, [threshold, onSwipeLeft, onSwipeRight])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
