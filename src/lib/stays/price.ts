// ── Price and score, in the words the sheet uses ──────────────────────────
// A listing gives a total for the dates; the Estimate wants a nightly rate.
// A score means nothing without its scale — 9.2 on Vrbo and 4.93 on Airbnb
// are the same house — so the label always carries the count, and the scale
// is decided by the site, never guessed from the number.

export type StaySite = "vrbo" | "airbnb" | "booking" | "google" | "expedia" | "direct" | "other";

/** Whole-dollar nightly rate from a total, or null when either is missing. */
export function nightlyFrom(total: number | null | undefined, nights: number): number | null {
  if (total == null || !(total > 0) || !(nights > 0)) return null;
  return Math.round(total / nights);
}

/** The scale a site scores out of. Vrbo and Booking are /10; Airbnb and Google are /5. */
export function siteScale(site: StaySite | string | null | undefined): 5 | 10 {
  return site === "vrbo" || site === "booking" ? 10 : 5;
}

/** "9.2 from 53" · "4.93 from 151" · "no reviews yet". */
export function scoreLabel(score: number | null | undefined, scale: 5 | 10, reviews: number | null | undefined): string {
  if (score == null || !reviews) return "no reviews yet";
  const s = scale === 10 ? score.toFixed(1) : score.toFixed(2).replace(/0$/, "");
  return `${s} from ${reviews}`;
}

/** The site's own name, for the link on the row. */
export function siteName(site: StaySite | string | null | undefined): string {
  switch (site) {
    case "vrbo": return "Vrbo";
    case "airbnb": return "Airbnb";
    case "booking": return "Booking.com";
    case "google": return "Google";
    case "expedia": return "Expedia";
    case "direct": return "Website";
    default: return "Listing";
  }
}
