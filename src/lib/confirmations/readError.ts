/**
 * What a person is told when a booking can't be read (2 Oct 2026). The route
 * used to hand back the raw error, so an Anthropic refusal ("Your credit
 * balance is too low", as a JSON blob) landed in the phone's toast word for
 * word. The real error goes to the server log; the person gets one plain line.
 */
export const NO_BOOKING = "No bookings found in document";

export function readBookingError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (msg === NO_BOOKING) return "Couldn't find a booking in that file. Try the confirmation email's PDF or a screenshot.";
  return "Couldn't read that booking just now. Try again in a little while.";
}
