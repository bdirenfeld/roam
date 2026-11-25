// How many of Brennan's replies are unread: one number shared by every door
// (the menu's dot, the avatar's dot). HelpHost fills it; opening Help clears it.
import { useSyncExternalStore } from "react";

let count = 0;
const subs: (() => void)[] = [];
export function setHelpUnread(n: number) {
  if (n === count) return;
  count = n;
  subs.slice().forEach((f) => f());
}
export const getHelpUnread = () => count;
export function subscribeHelpUnread(f: () => void) {
  subs.push(f);
  return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
}
export const useHelpUnread = () => useSyncExternalStore(subscribeHelpUnread, getHelpUnread, () => 0);

/** Opens Help from anywhere: HelpHost listens. */
export const HELP_EVENT = "roam:help";
export const openHelp = () => window.dispatchEvent(new CustomEvent(HELP_EVENT));
/** Opens the Help SHEET itself (the doors and the rows), e.g. coming back from Walkthroughs. */
export const HELP_SHEET_EVENT = "roam:help-sheet";
export const openHelpSheet = () => window.dispatchEvent(new CustomEvent(HELP_SHEET_EVENT));
