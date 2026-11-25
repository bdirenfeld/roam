// The Featurebase messenger (24 Nov 2026): where "Message us" goes once the
// identity secret is set. Brennan answers in Featurebase (web or its phone
// app); Roam's own chat stays as the fallback until then. Loaded on demand,
// with its floating button hidden: Roam's Help doors open it.
import { useSyncExternalStore } from "react";
import { setHelpUnread } from "./unread";

export const FEATUREBASE_APP_ID = "6b0631d78338380207ccf9b4";

let open: (() => void) | null = null;
let starting = false;
const subs: (() => void)[] = [];
const tell = () => subs.slice().forEach((f) => f());

/** Boots the messenger as this person. Safe to call twice; false when it could not start. */
export async function startMessenger(jwt: string): Promise<boolean> {
  if (open || starting) return !!open;
  starting = true;
  try {
    const fb = await import("featurebase-js");
    fb.default({ appId: FEATUREBASE_APP_ID, featurebaseJwt: jwt, hideDefaultLauncher: true });
    fb.whenReady(() => { fb.onUnreadCountChange((n: number) => setHelpUnread(n)); });
    open = () => fb.show();
    tell();
    return true;
  } catch (err) {
    console.error("[Roam] messenger did not start:", err);
    return false;
  } finally {
    starting = false;
  }
}

/** Opens the messenger; false when it is not running (Help then shows Roam's own chat). */
export function openMessenger(): boolean {
  if (!open) return false;
  open();
  return true;
}
export const messengerReady = () => !!open;
export function subscribeMessenger(f: () => void) {
  subs.push(f);
  return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
}
export const useMessengerReady = () => useSyncExternalStore(subscribeMessenger, messengerReady, () => false);
/** Tests only. */
export function __resetMessenger() { open = null; starting = false; tell(); }
