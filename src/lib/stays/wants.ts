// ── What it must have, and what would be nice ─────────────────────────────
// Brennan, 10 Sept 2026: "it's just a text box that doesn't tell you what to
// do with it ... people [should] type in whatever they want and explain what
// is must vs. nice to have." And the sentence he wants to be able to write:
//
//   "yes, we need a pool and a playground nearby or like shops and cafes
//    would be nice"
//
// Which is the whole design brief. Three jobs:
//
//   1. Read must from nice off the wording. "we need" is a must, "would be
//      nice" is not, and "or" is where one turns into the other. No qualifier
//      at all means a must: typing it is the ask.
//   2. Match each thing against what a listing can actually answer — Google's
//      amenity list, far richer than the two booleans this started with:
//      kitchen, parking, pets, a crib, step-free access.
//   3. Say back what it understood. The worst version of this box is the one
//      that silently ignores "playground" and never admits it.
//
// The three states still hold: only a must the listing positively contradicts
// is dropped. "Not listed" keeps its place and says so.

export type WantKind = "must" | "nice";

export interface Want {
  key: string;
  noun: string;
  kind: WantKind;
}

/** Something asked for that no listing can confirm — it steers the search instead. */
export interface LoosePhrase {
  phrase: string;
  kind: WantKind;
}

export interface Ask {
  musts: Want[];
  nices: Want[];
  unchecked: LoosePhrase[];
  /** The tidied line, folded into the search wording. */
  query: string;
}

/** What the listing says about one want. */
export type WantVerdict = "yes" | "no" | "unknown";

/**
 * The vocabulary. `typed` is what a person writes; `listed` is how Google
 * names it in a property's amenities. Everything outside this list still
 * steers the search — it simply cannot be enforced, and is named as such.
 */
const VOCAB: { key: string; noun: string; typed: RegExp; listed: RegExp }[] = [
  { key: "pool", noun: "Pool", typed: /\bpools?\b|\bswimming\b/i, listed: /\bpool\b/i },
  { key: "ac", noun: "AC", typed: /\ba\/?c\b|\bair.?con(ditioning)?\b/i, listed: /air.?conditioning/i },
  { key: "kitchen", noun: "Kitchen", typed: /\bkitchen\b|\bcook\b|\bself.?cater/i, listed: /\bkitchen(ette)?\b/i },
  { key: "laundry", noun: "Laundry", typed: /\blaundry\b|\bwasher\b|\bwashing machine\b/i, listed: /\bwasher\b|\blaundry\b/i },
  { key: "parking", noun: "Parking", typed: /\bparking\b|\bcar ?park\b|\bgarage\b/i, listed: /\bparking\b|\bgarage\b/i },
  { key: "wifi", noun: "Wi-Fi", typed: /\bwi.?fi\b|\binternet\b/i, listed: /wi.?fi|internet/i },
  { key: "pets", noun: "Pets", typed: /\bpets?\b|\bdogs?\b|\bfinn\b/i, listed: /pet.?friendly|pets? allowed/i },
  { key: "gym", noun: "Gym", typed: /\bgym\b|\bfitness\b/i, listed: /\bgym\b|fitness/i },
  { key: "breakfast", noun: "Breakfast", typed: /\bbreakfast\b/i, listed: /\bbreakfast\b/i },
  { key: "hottub", noun: "Hot tub", typed: /\bhot ?tub\b|\bjacuzzi\b/i, listed: /hot ?tub|jacuzzi/i },
  { key: "beach", noun: "Beach access", typed: /\bbeach ?(front|access)\b|\bon the beach\b/i, listed: /beach ?(front|access)/i },
  // Google's own word is "Kid-friendly" — the listed pattern only looked for
  // "child-friendly" and never matched a real listing (11 Sept 2026).
  { key: "kids", noun: "Child-friendly", typed: /\bcribs?\b|\bcots?\b|\bkid.?friendly\b|\bchild.?friendly\b/i, listed: /(child|kid).?friendly|\bcrib\b/i },
  { key: "accessible", noun: "Step-free", typed: /\baccessible\b|\bwheelchair\b|\bground ?floor\b|\bstep.?free\b/i, listed: /accessib|wheelchair/i },
  { key: "shuttle", noun: "Airport shuttle", typed: /\bshuttle\b|\bairport transfer\b/i, listed: /shuttle/i },
];

const NICE = /\b(nice to have|would be nice|is nice|nice|ideally|prefer(ably|red)?|would like|bonus|if possible|hopefully|not essential|optional)\b/i;
const MUST = /\b(must|needs?|needed|has to|have to|required?|essential|non.?negotiable)\b/i;

/** Words that carry no ask: "yes, we need a pool" is one want, not three. */
const FILLER = /^(yes|no|ok|okay|sure|please|thanks|we|i|it|they|also|like|or|and|the|a|an|some|any|just|really)$/i;

/**
 * Strip the scaffolding off a phrase so what is left is the thing itself.
 * "we need a pool" → "pool"; "cafes would be nice" → "cafes".
 */
function bare(phrase: string): string {
  return phrase
    .replace(NICE, " ")
    .replace(MUST, " ")
    .replace(/^\s*(yes|no|ok|okay|sure|please|so|and|or|but|also|like|we|i|it)\b/gi, " ")
    .replace(/\b(would|could|should|be|is|are|to|have|has|want|wants|somewhere|something|with|a|an|the)\b/gi, " ")
    .replace(/[!?"“”():*+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cut the line where the meaning turns. Commas and full stops separate asks;
 * so does "or", which is how "we need X or Y would be nice" pivots.
 */
function segments(text: string): string[] {
  return text.split(/[,;.]|\bor\b/i).map((s) => s.trim()).filter(Boolean);
}

/** Within one segment, "and" lists more of the same kind. */
function items(segment: string): string[] {
  return segment.split(/\band\b|&|\bplus\b/i).map((s) => s.trim()).filter(Boolean);
}

/** Read the whole line: what must be there, what would be nice, what cannot be checked. */
export function parseAsk(text: string | null | undefined): Ask {
  const query = (text ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const musts: Want[] = [];
  const nices: Want[] = [];
  const unchecked: LoosePhrase[] = [];
  if (!query) return { musts, nices, unchecked, query };

  // A segment with no qualifier of its own carries on from the one before,
  // so "shops and cafes would be nice" makes "shops" nice too.
  let kind: WantKind = "must";
  for (const segment of segments(query)) {
    const saysNice = NICE.test(segment);
    const saysMust = MUST.test(segment);
    if (saysNice && !saysMust) kind = "nice";
    else if (saysMust) kind = "must";

    for (const item of items(segment)) {
      const hits = VOCAB.filter((v) => v.typed.test(item));
      if (hits.length) {
        for (const h of hits) {
          if (musts.some((w) => w.key === h.key) || nices.some((w) => w.key === h.key)) continue;
          (kind === "must" ? musts : nices).push({ key: h.key, noun: h.noun, kind });
        }
        continue;
      }
      const phrase = bare(item);
      if (!phrase || phrase.length < 2 || FILLER.test(phrase)) continue;
      if (unchecked.some((u) => u.phrase === phrase)) continue;
      unchecked.push({ phrase, kind });
    }
  }
  return { musts, nices, unchecked, query };
}

/**
 * What a property's amenity list says about one want.
 * An empty list means the listing carries no amenities at all — unknown, never
 * a no. Rows off the map and his own saved places are always in that state.
 */
export function verdict(key: string, amenities: string[] | null | undefined, excluded?: string[] | null): WantVerdict {
  const v = VOCAB.find((x) => x.key === key);
  if (!v) return "unknown";
  // Google says what a place does NOT have in its own field. That is the only
  // thing that can be read as a no.
  if (excluded && excluded.length && v.listed.test(excluded.join(" | "))) return "no";
  if (!amenities || !amenities.length) return "unknown";
  return v.listed.test(amenities.join(" | ")) ? "yes" : "unknown";
}

/**
 * True only when the listing positively contradicts a must-have.
 *
 * It used to read a short amenity list as a complete one, and that emptied
 * the Osaka list twice. Google returns two or three HIGHLIGHTS — real
 * examples from 11 Sept 2026: ["Free Wi-Fi","Kid-friendly"], ["Free Wi-Fi",
 * "Kitchen"], and for one hotel []. Not one of the eighteen properties around
 * Osaka listed breakfast, so "must have breakfast" deleted every priced offer
 * and the list filled with map rows that had no price at all. Brennan saw
 * "no rates for Osaka" three times and none of it was about rates.
 *
 * Absence of a word from a list of two proves nothing. A no now has to be
 * stated (SerpApi's own excluded_amenities), or it is unknown, and an unknown
 * is carried onto the card as "Breakfast not listed" rather than acted on.
 */
export function failsAsk(ask: Ask, amenities: string[] | null | undefined, excluded?: string[] | null): boolean {
  return ask.musts.some((w) => verdict(w.key, amenities, excluded) === "no");
}

/**
 * What to say once, under the list, when a must-have came back unanswered.
 *
 * Brennan asked for this after the breakfast bug: "should we mention it if one
 * of our must-haves is not included in the data when making the API call?"
 *
 * Measured over 76 real properties on 11 Sept 2026, Google names Wi-Fi on 68
 * of them and AC on 61, but breakfast on only 13 — and beach access on none at
 * all. So asking for breakfast is a reasonable thing to do and mostly
 * unanswerable, and he should be told that once rather than having to notice
 * "not listed" row by row.
 */
export function unansweredNote(
  ask: Ask,
  rows: { amenities?: string[] | null; excluded?: string[] | null }[],
): string | null {
  if (!ask.musts.length || !rows.length) return null;
  const blind = ask.musts
    .map((m) => ({ m, n: rows.filter((r) => verdict(m.key, r.amenities, r.excluded) === "unknown").length }))
    .filter((x) => x.n > rows.length / 2)
    .sort((a, b) => b.n - a.n);
  if (!blind.length) return null;
  const nouns = blind.slice(0, 2).map((x) => x.m.noun.toLowerCase());
  const what = nouns.length === 2 ? `${nouns[0]} or ${nouns[1]}` : nouns[0];
  const n = blind[0].n;
  const all = n === rows.length;
  return `Google doesn't say either way about ${what} for ${all ? (n === 1 ? "this one" : "any of these") : `${n} of these ${rows.length}`}. Worth checking the listing.`;
}

/**
 * The note on a row kept but not verified, so a blank is never read as a yes.
 * Capped at two: a journey with no amenity data would otherwise repeat the
 * whole list on every row.
 */
export function askNote(ask: Ask, amenities: string[] | null | undefined): string | null {
  const unsure = [...ask.musts, ...ask.nices].filter((w) => verdict(w.key, amenities) === "unknown");
  if (!unsure.length) return null;
  const nouns = unsure.slice(0, 2).map((w) => w.noun);
  const more = unsure.length > 2 ? ` +${unsure.length - 2}` : "";
  return `${nouns.join(" and ")}${more} not listed`;
}

/** A "nice" the listing confirms, worth saying out loud on the row. */
export function askBonus(ask: Ask, amenities: string[] | null | undefined): string | null {
  const got = ask.nices.filter((w) => verdict(w.key, amenities) === "yes").map((w) => w.noun);
  return got.length ? got.slice(0, 2).join(" · ") : null;
}

/**
 * What the box says back, so it is never a guess what the line did.
 * One short line per group, and only the groups that exist.
 */
export function askSummary(ask: Ask): { must: string | null; nice: string | null; loose: string | null } {
  const loose = ask.unchecked.map((u) => u.phrase);
  return {
    must: ask.musts.length ? `Must have: ${ask.musts.map((w) => w.noun).join(" · ")}` : null,
    nice: ask.nices.length ? `Nice: ${ask.nices.map((w) => w.noun).join(" · ")}` : null,
    loose: loose.length ? `Can't check, so it steers the search: ${loose.slice(0, 4).join(", ")}` : null,
  };
}

/** The words worth offering on a journey like this one, so the box is not a blank page. */
export function suggestions(opts: { house: boolean; askGroundFloor?: boolean; askCot?: boolean }): string[] {
  const out = opts.house ? ["Pool", "Kitchen", "Laundry", "Parking"] : ["Pool", "Breakfast", "AC", "Parking"];
  if (opts.askGroundFloor) out.unshift("Step-free");
  if (opts.askCot) out.push("Child-friendly");
  return out.slice(0, 5);
}
