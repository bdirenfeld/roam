// The phone preview's screens (dev only, see ./devOnly.ts). A plain module,
// not a client one, so the server page can read the list.
// scripts/phone-check.mjs walks the same list.

/** Rendered in the browser by PhoneHarness over the stubbed data layer. */
export const CLIENT_SCREENS = [
  "day", "day-welcome",
  "card-cost", "card-closed", "card-late", "card-fit", "card-leg",
  "add-leg", "add-leg-from",
  "time", "time-cleared",
  "bookings-open", "bookings-asking", "bookings-booked",
  "toasts", "toasts-second",
  "past-menu", "copy-sheet", "copy-sheet-dates",
] as const;
export type ClientScreen = (typeof CLIENT_SCREENS)[number];

/** Rendered on the server, exactly as app/journey/[token] renders it. */
export const SERVER_SCREENS = ["shared"] as const;

export const SCREENS: readonly string[] = [...CLIENT_SCREENS, ...SERVER_SCREENS];

export function isClientScreen(s: string): s is ClientScreen {
  return (CLIENT_SCREENS as readonly string[]).includes(s);
}
