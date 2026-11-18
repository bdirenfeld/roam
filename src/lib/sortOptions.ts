// ── Picker options, A–Z ───────────────────────────────────────────────────
// The kind pickers on a card (Food / Activity / Logistics) list their options
// alphabetically, so a name is found by scanning rather than remembered by
// position (Brennan, 18 Nov 2026). Sorting here, not by hand in each file,
// keeps a newly added kind in order in all four pickers.

export function sortByLabel<T extends { label: string }>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

export function sortOptionLists<K extends string, T extends { label: string }>(
  lists: Record<K, readonly T[]>,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const key of Object.keys(lists) as K[]) out[key] = sortByLabel(lists[key]);
  return out;
}
