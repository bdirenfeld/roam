// The Featurebase messenger (24 Nov 2026): where Help's messages live.
// Brennan answers in Featurebase (web or its phone app). Loaded on demand,
// with its floating button hidden: Roam's Help doors open it.
//
// One system per person, never two (his finding, the same day): a door opened
// before the messenger had finished starting used to fall through to Roam's
// own chat, so a question went to one place and its history was looked for in
// the other. Every door now WAITS for the answer to "is the messenger there?":
//   "ready" → the messenger, always.
//   "off"   → Roam's own chat: no identity secret, signed out, or the messenger
//             never came up (an ad blocker stops it loading).
import { useSyncExternalStore } from "react";
import { setHelpUnread } from "./unread";

export const FEATUREBASE_APP_ID = "6b0631d78338380207ccf9b4";
/** How long a door waits for the messenger before falling back to Roam's own chat. */
export const MESSENGER_WAIT_MS = 8000;

export type MessengerStatus = "unknown" | "ready" | "off";
/** Where a door lands: the list of past conversations, or a new question. */
export type MessengerDoor = "messages" | "new";

interface Api { showMessages: () => void; showNewMessage: () => void }
let status: MessengerStatus = "unknown";
let api: Api | null = null;
let pending: Promise<boolean> | null = null;
const subs: (() => void)[] = [];
const set = (s: MessengerStatus) => { if (s !== status) { status = s; subs.slice().forEach((f) => f()); } };

async function identity(): Promise<string | null> {
  const r = await fetch("/api/help/identity").catch(() => null);
  if (!r?.ok || r.redirected) return null;
  const j = (await r.json().catch(() => null)) as { jwt?: string | null } | null;
  return j?.jwt ?? null;
}

async function boot(jwt: string, waitMs: number): Promise<boolean> {
  try {
    const fb = await import("featurebase-js");
    fb.default({ appId: FEATUREBASE_APP_ID, featurebaseJwt: jwt, hideDefaultLauncher: true });
    // Booting never throws when its script is blocked; only whenReady says it is really there.
    const up = await new Promise<boolean>((done) => {
      const t = setTimeout(() => done(false), waitMs);
      fb.whenReady(() => { clearTimeout(t); done(true); });
    });
    if (!up) return false;
    fb.onUnreadCountChange((n: number) => setHelpUnread(n));
    api = { showMessages: () => fb.showMessages(), showNewMessage: () => fb.showNewMessage() };
    return true;
  } catch (err) {
    console.error("[Roam] messenger did not start:", err);
    return false;
  }
}

/** Finds out, once, whether this person's Help is the messenger. Safe to call from every door. */
export function initMessenger(waitMs: number = MESSENGER_WAIT_MS): Promise<boolean> {
  if (!pending) {
    pending = identity().then((jwt) => (jwt ? boot(jwt, waitMs) : false)).catch(() => false).then((ok) => { set(ok ? "ready" : "off"); return ok; });
  }
  return pending;
}

/** Opens the messenger once it is known to be there; false means show Roam's own chat instead. */
export async function openMessenger(door: MessengerDoor = "messages"): Promise<boolean> {
  if (!(await initMessenger()) || !api) return false;
  if (door === "new") api.showNewMessage(); else api.showMessages();
  return true;
}

export const messengerStatus = () => status;
export function subscribeMessenger(f: () => void) {
  subs.push(f);
  return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
}
export const useMessengerStatus = () => useSyncExternalStore(subscribeMessenger, messengerStatus, () => "unknown" as MessengerStatus);
/** Tests only: start from a known answer. */
export function __resetMessenger(to: MessengerStatus = "unknown") { api = null; pending = to === "unknown" ? null : Promise.resolve(false); status = "unknown"; set(to); }
