/**
 * The toast after "Give these times" / "Re-plan the whole day" (7 Oct 2026,
 * re-audit). It said "Tue arranged": a weekday with no date, and a word for
 * what the app did rather than what changed. Now it counts what changed.
 */
export function givenTimesLine(given: number, unplaced: number): string {
  const head = `${given} ${given === 1 ? "place" : "places"} given a time`;
  return unplaced ? `${head}; ${unplaced} left without a time` : head;
}
