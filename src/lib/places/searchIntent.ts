/**
 * Is this a "what's here" search rather than a name? (27 Sep 2026)
 * Autocomplete matches names: "summer day camp kids Barcelona" came back with
 * camps in New York, New Jersey and Florida, and a family looking for day
 * camps, a playground or pizza near the flat got nothing useful. Those go to
 * Google's text search as well, which reads "camp in Barcelona" the way a
 * person means it. A plain name ("Tootsies", "Colosseum") stays autocomplete.
 */
const CATEGORY = /\b(camps?|day ?camps?|playgrounds?|parks?|beach(es)?|pools?|restaurants?|pizza|pizzeria|gelato|ice cream|bakery|bakeries|cafes?|coffee|bars?|pubs?|brunch|breakfast|supermarkets?|grocery|pharmacy|pharmacies|doctors?|hospitals?|laundr(y|omat)|museums?|galler(y|ies)|zoos?|aquariums?|markets?|shops?|shopping|toy ?stores?|bookstores?|hotels?|hostels?|apartments?|villas?|spas?|gyms?|swimming|kids|children|family|tennis|golf|surf|bike (rental|hire)|car (rental|hire)|things to do|attractions?)\b/i;
const AREA = /\s(in|near|around|close to)\s/i;

export function isCategorySearch(q: string): boolean {
  const s = q.trim();
  if (s.split(/\s+/).length < 2 && !/^(camps?|pizza|gelato|playgrounds?|beach(es)?)$/i.test(s)) return false;
  return CATEGORY.test(s) || AREA.test(` ${s} `);
}
