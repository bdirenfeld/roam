/**
 * Roam's how-to videos (2 Oct 2026). Mock approved: video-placement-mock.html,
 * both of its calls answered yes — a Videos tile in the journey menu, and one
 * video at a time on the computer's Start here card.
 *
 * The one rule: the right video at the right moment, shown once, where it
 * helps. "Gone" = played or closed with ✕. After that every video stays in the
 * journey menu under Videos.
 *
 * The files live in the public Supabase bucket `how-to-videos`, never in the
 * repo (every byte in public/ rides along in every Vercel deployment). Which
 * videos are switched on is read from `videos.json` in the same bucket —
 * `{ "<id>": <version> }`, version > 0 = on — so a video is switched on, or
 * replaced by a new cut, with `node scripts/upload-video.mjs`, no deploy.
 * No videos.json, or a fetch that fails: nothing shows anywhere.
 */

export type VideoId = "first-journey" | "install-iphone" | "install-android" | "planning-computer" | "more-tricks" | "before-the-trip" | "on-the-trip" | "in-the-app";

/** The places a video is offered before it is gone. The menu lists every switched-on video, always. */
export type Surface = "journeys-empty" | "start-here" | "start-here-computer" | "shared-link" | "trip-underway";

export interface HowToVideo {
  id: VideoId;
  title: string;
  /** What the prompt says: "Watch: Your first journey · 1 min". */
  length: string;
  /** In the bucket. The version from videos.json rides on the URL. */
  file: string;
  poster: string;
  surfaces: Surface[];
  /** Only listed on this kind of phone (the install clip has a version for each). */
  device?: "iphone" | "android";
}

/** What the person is holding, for device-only videos. */
export type Device = "iphone" | "android" | "computer";
export function deviceOf(userAgent: string): Device {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  return "computer";
}

export const BUCKET = "how-to-videos";
export const MANIFEST = "videos.json";

export const VIDEOS: HowToVideo[] = [
  {
    id: "first-journey",
    title: "Your first journey",
    length: "1 min",
    file: "first-journey.mp4",
    poster: "first-journey.jpg",
    surfaces: ["journeys-empty", "start-here", "start-here-computer"],
  },
  {
    // The install clip (6 Oct 2026): one version per phone, each listed only
    // there; a computer lists neither. iPhone steps follow iOS 26 Safari.
    id: "install-iphone",
    title: "Put Roam on your phone",
    length: "20 s",
    file: "install-iphone.mp4",
    poster: "install-iphone.jpg",
    surfaces: [],
    device: "iphone",
  },
  {
    id: "install-android",
    title: "Put Roam on your phone",
    length: "15 s",
    file: "install-android.mp4",
    poster: "install-android.jpg",
    surfaces: [],
    device: "android",
  },
  {
    id: "planning-computer",
    title: "Planning on a computer",
    length: "1 min",
    file: "planning-computer.mp4",
    poster: "planning-computer.jpg",
    surfaces: ["start-here-computer"],
  },
  {
    // The short follow-on to video 2 (5 Oct 2026): taking a card off its day,
    // and one day at a time on the map. In the Videos list only.
    id: "more-tricks",
    title: "Planning shortcuts",
    length: "20 s",
    file: "more-tricks.mp4",
    poster: "more-tricks.jpg",
    surfaces: [],
  },
  {
    // Video 4 (2 Oct 2026): the organiser on their phone, mid-trip. Offered on
    // the phone's day once the journey is under way ("Your trip's started").
    id: "in-the-app",
    title: "Using Roam on your trip",
    length: "1 min",
    file: "in-the-app.mp4",
    poster: "in-the-app.jpg",
    surfaces: ["trip-underway"],
  },
  // The order above (5 Oct 2026, Brennan): the organiser's four in the order
  // they use Roam. Below: the two for people who open the shared link.
  {
    // Video 3 for someone who opens the shared link before the trip starts
    // (5 Oct 2026). The strip picks this or "on the trip" by date
    // (sharedLinkVideo); both stay in the Videos list.
    id: "before-the-trip",
    title: "Following along: before the trip",
    length: "45 s",
    file: "before-the-trip.mp4",
    poster: "before-the-trip.jpg",
    surfaces: ["shared-link"],
  },
  {
    id: "on-the-trip",
    title: "Following along: during the trip",
    length: "45 s",
    file: "on-the-trip.mp4",
    poster: "on-the-trip.jpg",
    surfaces: ["shared-link"],
  },
];

/** Switched-on videos and their versions. */
export type Available = Partial<Record<VideoId, number>>;
/** What a person has played or closed: id → when. */
export type Seen = Partial<Record<VideoId, string>>;

/** Reads videos.json. Anything malformed switches that entry (or everything) off. */
export function parseManifest(raw: unknown): Available {
  const out: Available = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const v of VIDEOS) {
    const n = (raw as Record<string, unknown>)[v.id];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[v.id] = Math.floor(n);
  }
  return out;
}

/** Reads users.videos_seen. Only known ids survive. */
export function parseSeen(raw: unknown): Seen {
  const out: Seen = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const v of VIDEOS) {
    const t = (raw as Record<string, unknown>)[v.id];
    if (typeof t === "string" && t) out[v.id] = t;
  }
  return out;
}

export function videoById(id: VideoId): HowToVideo {
  return VIDEOS.find((v) => v.id === id)!;
}

function publicUrl(base: string, name: string, version: number): string {
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${name}?v=${version}`;
}
export function manifestUrl(base: string): string {
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${MANIFEST}`;
}
export function fileUrl(base: string, v: HowToVideo, available: Available): string {
  return publicUrl(base, v.file, available[v.id] ?? 0);
}
export function posterUrl(base: string, v: HowToVideo, available: Available): string {
  return publicUrl(base, v.poster, available[v.id] ?? 0);
}

/** The menu's list: every switched-on video, in order, whether seen or not. */
export function listed(available: Available, device: Device = "computer"): HowToVideo[] {
  return VIDEOS.filter((v) => (available[v.id] ?? 0) > 0 && (!v.device || v.device === device));
}

/** The first switched-on, not-yet-gone video for a surface, or null. */
export function forSurface(surface: Surface, available: Available, gone: Seen): VideoId | null {
  const v = VIDEOS.find((x) => x.surfaces.includes(surface) && (available[x.id] ?? 0) > 0 && !gone[x.id]);
  return v ? v.id : null;
}

/**
 * Which video the Start here card carries, decided ONCE per visit from what
 * was gone when the card first had an answer (`seenAtLoad`), so the computer
 * shows one at a time: video 1, and only on a later visit, video 2. What goes
 * during the visit (`goneNow`) just takes its row away; nothing slides in.
 * The phone's card offers video 1 only. `style` is the mock's: video 1 is a
 * row with its poster at the top of the card; video 2 is one quiet line.
 */
export function startHereVideo(opts: {
  computer: boolean;
  available: Available;
  seenAtLoad: Seen;
  goneNow: Seen;
}): { id: VideoId; style: "row" | "line" } | null {
  const id = forSurface(opts.computer ? "start-here-computer" : "start-here", opts.available, opts.seenAtLoad);
  if (!id || opts.goneNow[id]) return null;
  return { id, style: id === "first-journey" ? "row" : "line" };
}

/**
 * Which video 3 the shared link offers (5 Oct 2026): "Before the trip" until
 * the first day, "On the trip" from then on. If the one that fits is not
 * switched on, the other is offered; neither on, nothing. No dates: before.
 */
export function sharedLinkVideo(startDate: string | null, today: string, available: Available): VideoId | null {
  const before = !startDate || today < startDate;
  const order: VideoId[] = before ? ["before-the-trip", "on-the-trip"] : ["on-the-trip", "before-the-trip"];
  return order.find((id) => (available[id] ?? 0) > 0) ?? null;
}

/** localStorage key for a visitor with no account (the shared link). */
export function localSeenKey(id: VideoId): string {
  return `roam:video-seen:${id}`;
}

/** Widest a video plays on a computer; wider than this and a 1-minute how-to is a cinema. */
export const WIDE_PLAYER_MAX = 960;

/**
 * The centred player's size on a computer (2 Oct 2026, Brennan: full screen
 * everywhere was too much on a wide screen): about two-thirds of the window's
 * width, never over 960 px, never taller than 80% of the window (room for the ✕ above it), at the
 * video's own shape (16:9 or 4:5; 16:9 until the file says otherwise).
 */
export function widePlayerSize(aspect: number, vw: number, vh: number): { width: number; height: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  const width = Math.floor(Math.min(vw * (2 / 3), WIDE_PLAYER_MAX, vh * 0.8 * a));
  return { width, height: Math.floor(width / a) };
}
