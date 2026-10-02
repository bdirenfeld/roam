"use client";

// ── How-to videos: what is switched on, and what this person has seen ──────
// Pure rules in lib/videos/howTo. This file holds the two reads and the one
// write, once per page load, shared by every surface that asks (module-level,
// like the weather cache), so the Journeys card, Start here and the menu agree
// the moment one of them is played or closed.
//
// Signed in: users.videos_seen, written through mark_video_seen (migration
// 014), so the phone and the computer agree. A copy goes in localStorage too,
// so a write that fails still holds on this device. A failed READ counts every
// video as gone: the prompts stay away rather than nag; the menu still lists.
// The shared link has no account: `useVisitorVideo` keeps it in localStorage.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  VIDEOS, manifestUrl, parseManifest, parseSeen, localSeenKey,
  type Available, type Seen, type VideoId,
} from "@/lib/videos/howTo";

export const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

let manifestP: Promise<Available> | null = null;
export function loadManifest(): Promise<Available> {
  if (!manifestP) {
    manifestP = fetch(manifestUrl(SUPABASE_BASE), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(parseManifest)
      .catch(() => ({}));
  }
  return manifestP;
}

function localSeen(): Seen {
  const out: Seen = {};
  try {
    for (const v of VIDEOS) {
      const t = window.localStorage.getItem(localSeenKey(v.id));
      if (t) out[v.id] = t;
    }
  } catch { /* private mode: nothing remembered locally */ }
  return out;
}
function rememberLocally(id: VideoId, at: string) {
  try { window.localStorage.setItem(localSeenKey(id), at); } catch { /* ignore */ }
}

type SeenState = { ready: boolean; signedIn: boolean; seen: Seen };
let seenState: SeenState = { ready: false, signedIn: false, seen: {} };
let seenStarted = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

function loadSeen() {
  if (seenStarted) return;
  seenStarted = true;
  (async () => {
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) {
        seenState = { ready: true, signedIn: false, seen: localSeen() };
      } else {
        const { data, error } = await sb.from("users").select("videos_seen").eq("id", uid).maybeSingle();
        if (error) {
          console.error("[videos] could not read videos_seen", error.message);
          const all: Seen = {};
          for (const v of VIDEOS) all[v.id] = "unknown";
          seenState = { ready: true, signedIn: true, seen: all };
        } else {
          seenState = { ready: true, signedIn: true, seen: { ...localSeen(), ...parseSeen((data as { videos_seen?: unknown } | null)?.videos_seen) } };
        }
      }
    } catch (e) {
      console.error("[videos] seen read failed", e);
      seenState = { ready: true, signedIn: false, seen: localSeen() };
    }
    notify();
  })();
}

export function markSeen(id: VideoId) {
  if (seenState.seen[id]) return;
  const at = new Date().toISOString();
  seenState = { ...seenState, seen: { ...seenState.seen, [id]: at } };
  rememberLocally(id, at);
  notify();
  if (!seenState.signedIn) return;
  createClient().rpc("mark_video_seen", { video: id }).then(({ error }) => {
    if (error) console.error("[videos] could not save seen", error.message);
  });
}

/** Signed-in surfaces: Journeys, Start here, the menu. */
export function useHowToVideos(): { ready: boolean; available: Available; seen: Seen; markSeen: (id: VideoId) => void } {
  const [, bump] = useState(0);
  const [available, setAvailable] = useState<Available | null>(null);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    loadSeen();
    let live = true;
    loadManifest().then((a) => { if (live) setAvailable(a); });
    return () => { live = false; listeners.delete(f); };
  }, []);
  return { ready: available !== null && seenState.ready, available: available ?? {}, seen: seenState.seen, markSeen };
}

/** The shared link: no account, so "gone" lives on this device only. */
export function useVisitorVideo(id: VideoId): { ready: boolean; available: Available; gone: boolean; dismiss: () => void } {
  const [available, setAvailable] = useState<Available | null>(null);
  const [gone, setGone] = useState(true);
  useEffect(() => {
    let live = true;
    setGone(!!localSeen()[id]);
    loadManifest().then((a) => { if (live) setAvailable(a); });
    return () => { live = false; };
  }, [id]);
  const dismiss = useCallback(() => { rememberLocally(id, new Date().toISOString()); setGone(true); }, [id]);
  return { ready: available !== null, available: available ?? {}, gone, dismiss };
}
