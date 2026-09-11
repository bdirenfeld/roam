// ── The name on the row ───────────────────────────────────────────────────
//
// A hotel has a name. A short-term rental has a sales pitch, and Google hands
// the pitch over as the name. Real ones, pulled from his own journeys on
// 11 Sept 2026:
//
//   "Massive 1,000 sq ft; 3 train lines; Airbnb Superhost; Sealy Hybrid beds"
//   "Beach House with garden - 4 mins walk to water, 2 bed 1 bath"
//   "Cosy 1-Bed near Sydney CBD | Sleeps 4 + Balcony"
//   "ELEGANT TROPICAL VILLA RETREAT,ACROSS THE STREET FROM THE BEACH"
//
// The first of those was a New York option and it reads as a banner ad, not a
// place (Brennan: "those don't make a whole lot of sense"). The pitch is not
// worth nothing — it just is not the name, so it is cut back to the part that
// names the place and the rest is dropped. The card still links to the real
// listing, where the whole pitch lives.

/** Where a pitch starts: a separator that introduces a second claim. */
const BREAK = /\s*[;|·]\s*|\s+[-–—]\s+|,\s*(?=[A-Z]{3,})/;

/** A segment that is only a claim, never a name. */
const PITCH = /^(sleeps?|free|walk|steps|mins?|minutes?|near|close|\d+\s*(bed|bath|min))/i;

const MAX = 42;

function titleCase(s: string): string {
  return s.replace(/\w[\w']*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * The shortest thing that still names the place.
 * A real hotel name comes back untouched.
 */
export function listingName(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return clean;

  // SHOUTING is a pitch tell, not a name. Only when it is long enough to be a
  // sentence — "YHA", "ITH" and "MONday" are names.
  const shouted = clean.length > 12 && clean === clean.toUpperCase() && /[A-Z]{4,}/.test(clean);

  // Split BEFORE any title-casing: one of the separators is a comma followed
  // by shouting, and title-casing first hides it.
  const parts = clean.split(BREAK).map((p) => p.trim()).filter(Boolean);
  let name = parts.find((p) => !PITCH.test(p)) ?? parts[0] ?? clean;
  if (shouted) name = titleCase(name);

  // Still a mouthful: cut at a word, never mid-word, and say it was cut.
  if (name.length > MAX) {
    const cut = name.slice(0, MAX);
    const at = cut.lastIndexOf(" ");
    name = (at > 20 ? cut.slice(0, at) : cut).replace(/[,\s]+$/, "") + "…";
  }
  return name;
}
