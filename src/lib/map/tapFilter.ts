// ── What a tap on a filter pill means ─────────────────────────────────────
// Brennan, Sept 2026: "when you press something it turns it off. It doesn't
// filter to just that. If you press food it doesn't just show you everything
// that's food-related."
//
// So a tap ISOLATES. From the resting state, where everything is shown,
// tapping one pill narrows to it. Tapping more widens the selection, and
// tapping the last one standing returns to showing everything — there is no
// dead end where nothing is on the map.
//
// This lived inside FullMapClient and so applied only to the phone overlay;
// the desktop sidebar still used add/remove toggles, which is why the two
// behaved differently (10 Sept 2026).

export function tapFilter<T>(current: Set<T>, all: T[], key: T): Set<T> {
  // Everything on is the resting state: narrow to the one that was tapped.
  if (current.size >= all.length) return new Set([key]);
  const next = new Set(current);
  if (next.has(key)) {
    // Turning off the last one would empty the map; show everything instead.
    if (next.size === 1) return new Set(all);
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** True when the filter is narrowing rather than resting. */
export function isNarrowed<T>(current: Set<T>, all: T[]): boolean {
  return current.size > 0 && current.size < all.length;
}
