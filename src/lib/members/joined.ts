// ── "Isha joined Tuscany" (7 Oct 2026, delight audit) ──────────────────────
// When the journey's owner opens it, the app's one toast says who has joined
// since they last looked. Approved mock: d09-someone-joined.
//
// "New" is per device: the member's user id is not yet in a localStorage list
// keyed by the trip. The very first run on a device seeds the list with
// everyone who joined more than 14 days ago, so a journey shared months ago
// does not greet its owner with old news. Recent, unseen joins do toast.
//
// Several at once → ONE toast ("Isha and Sam joined Tuscany"): the toast
// replaces itself, so a queue would need its own timers for no gain.
//
// Storage that fails (private mode, blocked site data) shows nothing: a toast
// that repeats on every open is worse than one that never comes.

export interface JoinedMember {
  userId: string;
  /** users.name's first word, else the email before "@". Null when unknown. */
  firstName: string | null;
  /** trip_members.created_at, ISO. */
  createdAt: string;
}

/** Joins older than this on the first run are treated as already seen. */
export const FIRST_RUN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const seenKey = (tripId: string) => `roam:members-seen:${tripId}`;

/** "Isha Seth" → "Isha"; no name → "isha" from isha@example.com; neither → null. */
export function firstName(name: string | null | undefined, email: string | null | undefined): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const e = (email ?? "").trim().split("@")[0];
  return e || null;
}

/** "Isha joined X" · "Isha and Sam joined X" · "Isha, Sam and Jo joined X". */
export function joinedMessage(names: string[], tripTitle: string): string {
  const who =
    names.length <= 1
      ? names[0] ?? ""
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} joined ${tripTitle}`;
}

/**
 * Who to announce, and the seen list to store afterwards.
 * `seen` null = first run on this device for this trip.
 * Members with no known name are neither announced nor marked seen, so they
 * can be announced once a name is readable.
 */
export function newJoiners(
  members: JoinedMember[],
  seen: string[] | null,
  now: number,
): { announce: JoinedMember[]; nextSeen: string[] } {
  const seenSet = new Set(seen ?? []);
  if (seen === null) {
    for (const m of members) {
      const t = Date.parse(m.createdAt);
      if (Number.isFinite(t) && t < now - FIRST_RUN_WINDOW_MS) seenSet.add(m.userId);
    }
  }
  const announce = members.filter((m) => !seenSet.has(m.userId) && m.firstName);
  for (const m of announce) seenSet.add(m.userId);
  return { announce, nextSeen: Array.from(seenSet) };
}

/** Read the seen list. null = never stored; throws when storage is unusable. */
export function readSeen(storage: Storage, tripId: string): string[] | null {
  const raw = storage.getItem(seenKey(tripId));
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The whole decision for one open: read, decide, write, and only then return
 * the message. Any storage failure returns null (show nothing).
 */
export function joinedToastFor(
  storage: Storage | null,
  tripId: string,
  tripTitle: string,
  members: JoinedMember[],
  now: number,
): string | null {
  if (!storage) return null;
  try {
    const seen = readSeen(storage, tripId);
    const { announce, nextSeen } = newJoiners(members, seen, now);
    if (seen === null || announce.length > 0) {
      storage.setItem(seenKey(tripId), JSON.stringify(nextSeen));
    }
    if (announce.length === 0) return null;
    return joinedMessage(announce.map((m) => m.firstName as string), tripTitle);
  } catch {
    return null;
  }
}
