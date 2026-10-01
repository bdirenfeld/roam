/**
 * Who is travelling (30 Sep 2026). Brennan: "we should put in kids, their
 * ages, and if people are seniors". The app only had a head count, so Plan my
 * trip and Find guessed: Japan (five, no ages) planned as five adults.
 *
 * Stored as `trips.party_ages`, one age per person, which everything already
 * reads (lib/plan/draftRows hasChildren, Find, Where to stay). Adults and
 * seniors the person never gave an age for are stored as ADULT_AGE and
 * SENIOR_AGE; real ages already saved are kept.
 */

export interface Party { adults: number; seniors: number; kids: number[] }

/** Under this is a kid; from SENIOR_FROM a senior. */
export const KID_UNDER = 18;
export const SENIOR_FROM = 65;
export const ADULT_AGE = 40;
export const SENIOR_AGE = 70;

/** The party from a head count and whatever ages are saved. Without ages, everyone is an adult. */
export function partyFrom(size: number | null, ages: number[] | null): Party {
  const a = ages ?? [];
  const kids = a.filter((x) => x < KID_UNDER).sort((p, q) => q - p);
  const seniors = a.filter((x) => x >= SENIOR_FROM).length;
  const known = a.length - kids.length - seniors;
  const adults = Math.max(known, (size ?? 1) - kids.length - seniors, kids.length || seniors ? 0 : 1);
  return { adults, seniors, kids };
}

/** One age per person, keeping the real ages already saved where the count still fits. */
export function agesFrom(p: Party, prev: number[] | null): number[] {
  const was = prev ?? [];
  const adults = was.filter((x) => x >= KID_UNDER && x < SENIOR_FROM);
  const seniors = was.filter((x) => x >= SENIOR_FROM);
  const take = (from: number[], n: number, pad: number) => Array.from({ length: n }, (_, i) => from[i] ?? pad);
  return [...take(adults, p.adults, ADULT_AGE), ...take(seniors, p.seniors, SENIOR_AGE), ...p.kids];
}

export function partySize(p: Party): number {
  return p.adults + p.seniors + p.kids.length;
}

/** "2 adults · 3 kids (10, 8, 5)". */
export function partyLine(p: Party): string {
  const parts: string[] = [];
  if (p.adults) parts.push(`${p.adults} ${p.adults === 1 ? "adult" : "adults"}`);
  if (p.seniors) parts.push(`${p.seniors} ${p.seniors === 1 ? "senior" : "seniors"}`);
  if (p.kids.length) parts.push(`${p.kids.length} ${p.kids.length === 1 ? "kid" : "kids"} (${p.kids.join(", ")})`);
  return parts.join(" · ");
}

/** Anyone 65 or over: plan gently, as for young children. */
export function hasSeniors(ages: number[] | null): boolean {
  return (ages ?? []).some((a) => a >= SENIOR_FROM);
}

/**
 * Ages carried from one trip to a later one: everyone is older by the whole
 * years between them. New journeys start from the last journey's party
 * (30 Sep 2026) — a year on, Sai is 11, not 10.
 */
export function ageForward(ages: number[] | null, fromDate: string | null, toDate: string | null): number[] | null {
  if (!ages || !fromDate || !toDate) return ages;
  const years = Math.floor((Date.parse(toDate + "T00:00:00Z") - Date.parse(fromDate + "T00:00:00Z")) / (365.25 * 86_400_000));
  return years ? ages.map((a) => Math.max(0, a + years)) : ages;
}
