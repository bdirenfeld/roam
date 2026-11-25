/**
 * The map on Journeys (25 Nov 2026, mocks approved): one dot per journey,
 * where it went. Solid for a journey coming up, hollow for one already taken.
 * Archived journeys and the Example are not on it, and a journey with no
 * place on the map has no dot. The buttons over the map choose which dots
 * show: All, Coming up, then one per past year.
 */

export interface DotSource {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  destination_lat: number | null;
  destination_lng: number | null;
  cover_image_url?: string | null;
}

export interface JourneyDot {
  id: string;
  title: string;
  /** The first part of the destination ("Irving" of "Irving, TX, USA"); the title when there is none. */
  place: string;
  /** The whole destination, for the photo's fallback. */
  destination: string;
  lat: number;
  lng: number;
  upcoming: boolean;
  /** The year it starts in. */
  year: number;
  /** "Mar 14–17, 2027" */
  dates: string;
  cover: string | null;
  href: string;
}

export const ALL = "All";
export const COMING_UP = "Coming up";
export const EARLIER = "Earlier";
/** Past years with a button of their own; older ones share "Earlier". */
export const YEAR_BUTTONS = 4;
/** Fewer journeys than this and there is no map: one dot on a world is nothing to look at. */
export const MAP_MIN_JOURNEYS = 2;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "Mar 14–17, 2027", "Aug 24 – Sep 5, 2027", "Dec 28, 2026 – Jan 3, 2027". Calendar days, no clock. */
export function dotDates(start: string, end: string): string {
  const s = parts(start), e = parts(end);
  if (!s) return "";
  if (!e || (s[0] === e[0] && s[1] === e[1] && s[2] === e[2])) return `${MONTHS[s[1] - 1]} ${s[2]}, ${s[0]}`;
  if (s[0] !== e[0]) return `${MONTHS[s[1] - 1]} ${s[2]}, ${s[0]} – ${MONTHS[e[1] - 1]} ${e[2]}, ${e[0]}`;
  if (s[1] === e[1]) return `${MONTHS[s[1] - 1]} ${s[2]}–${e[2]}, ${s[0]}`;
  return `${MONTHS[s[1] - 1]} ${s[2]} – ${MONTHS[e[1] - 1]} ${e[2]}, ${s[0]}`;
}

export function placeOf(destination: string | null, title: string): string {
  return (destination ?? "").split(",")[0].trim() || title;
}

function onTheMap(t: DotSource): boolean {
  const { destination_lat: lat, destination_lng: lng } = t;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // 0,0 is "no place set", not a journey to the Gulf of Guinea.
  return !(lat === 0 && lng === 0);
}

/**
 * The dots, past ones first so a journey coming up is drawn on top of one
 * taken to the same place. The page has already split its journeys into
 * upcoming and past (lib/tripRecency) and left the archived ones out.
 */
export function journeyDots(upcoming: DotSource[], past: DotSource[], hrefs: Record<string, string>, exampleTitle?: string): JourneyDot[] {
  const dot = (t: DotSource, isUp: boolean): JourneyDot => ({
    id: t.id,
    title: t.title,
    place: placeOf(t.destination, t.title),
    destination: t.destination ?? "",
    lat: t.destination_lat as number,
    lng: t.destination_lng as number,
    upcoming: isUp,
    year: parts(t.start_date)?.[0] ?? 0,
    dates: dotDates(t.start_date, t.end_date),
    cover: t.cover_image_url ?? null,
    href: hrefs[t.id] ?? `/trips/${t.id}`,
  });
  const keep = (t: DotSource) => onTheMap(t) && t.title !== exampleTitle;
  return [...past.filter(keep).map((t) => dot(t, false)), ...upcoming.filter(keep).map((t) => dot(t, true))];
}

export function showsMap(dots: JourneyDot[]): boolean {
  return dots.length >= MAP_MIN_JOURNEYS;
}

/** The past years that get their own button, newest first. */
function yearButtons(dots: JourneyDot[]): number[] {
  const years = Array.from(new Set(dots.filter((d) => !d.upcoming).map((d) => d.year))).sort((a, b) => b - a);
  return years.slice(0, YEAR_BUTTONS);
}

/** All, Coming up (if anything is), a button per past year, then Earlier for the rest. */
export function dotFilters(dots: JourneyDot[]): string[] {
  const years = yearButtons(dots);
  const older = dots.some((d) => !d.upcoming && !years.includes(d.year));
  return [ALL, ...(dots.some((d) => d.upcoming) ? [COMING_UP] : []), ...years.map(String), ...(older ? [EARLIER] : [])];
}

export function filterDots(dots: JourneyDot[], filter: string): JourneyDot[] {
  if (filter === ALL) return dots;
  if (filter === COMING_UP) return dots.filter((d) => d.upcoming);
  if (filter === EARLIER) {
    const years = yearButtons(dots);
    return dots.filter((d) => !d.upcoming && !years.includes(d.year));
  }
  return dots.filter((d) => !d.upcoming && String(d.year) === filter);
}

/** [[west, south], [east, north]] around the dots; null when there are none. */
export function dotBounds(dots: JourneyDot[]): [[number, number], [number, number]] | null {
  if (dots.length === 0) return null;
  const lngs = dots.map((d) => d.lng), lats = dots.map((d) => d.lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
