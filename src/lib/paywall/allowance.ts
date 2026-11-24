// ── The paywall, in one place ─────────────────────────────────────────────
// Roam's first journey is free; a one-time payment unlocks every journey after
// it (Brennan, 24 Nov 2026: "$5 to use the app", with the first journey kept
// free so a stranger reaches a filled trip before being asked to pay).
//
// The database enforces the same rule: a BEFORE INSERT trigger on `trips`
// (migration `paywall_journey_allowance`) raises PAYMENT_REQUIRED, so a client
// that skips this check still cannot create a second journey. Keep the numbers
// here and in that trigger in step.

/** Journeys a traveller can own before paying. */
export const FREE_JOURNEYS = 1;

/** The one-time price, in cents of PRICE_CURRENCY. */
export const PRICE_CENTS = 500;

/** Checkout currency. CAD because the Stripe account settles and pays out in
 *  CAD, so a USD charge would lose ~2% to conversion (Brennan, 24 Nov 2026). */
export const PRICE_CURRENCY = "cad";

/** "$5", for copy. Whole dollars drop the cents. */
export const PRICE_LABEL = `$${PRICE_CENTS % 100 === 0 ? PRICE_CENTS / 100 : (PRICE_CENTS / 100).toFixed(2)}`;

/** What Stripe shows on the receipt. */
export const PRODUCT_NAME = "Roam: unlimited journeys";

import { SAMPLE_TITLE } from "@/lib/sampleTrip/itinerary";
// The sample journey the onboarding can add never counts toward the free one.
// The trigger matches the same title, so keep SAMPLE_TITLE and it in step.

/** The marker the database trigger raises; the client maps it to the paywall. */
export const PAYMENT_REQUIRED = "PAYMENT_REQUIRED";

export interface OwnedJourney {
  title: string | null;
}

/** Journeys that count toward the free allowance: the traveller's own, minus the sample. */
export function countedJourneys(owned: OwnedJourney[]): number {
  return owned.filter((t) => t.title !== SAMPLE_TITLE).length;
}

/** May this traveller create one more journey? */
export function canCreateJourney(hasPaid: boolean | null | undefined, owned: OwnedJourney[]): boolean {
  if (hasPaid) return true;
  return countedJourneys(owned) < FREE_JOURNEYS;
}

/** Did a failed insert fail because of the paywall (the trigger's marker)? */
export function isPaymentRequired(err: { message?: string | null } | null | undefined): boolean {
  return !!err?.message && err.message.includes(PAYMENT_REQUIRED);
}
