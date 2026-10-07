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

/** What the upload's toast may say when a read fails. */
export const READ_FAILED = "Couldn't read that file. Try again.";

/**
 * The route's answers a person may see as they are (6 Oct 2026). Anything
 * else the route or the network says — "ANTHROPIC_API_KEY not configured",
 * "Invalid form data", a stack trace — becomes READ_FAILED, never the raw text.
 */
const FRIENDLY = new Set<string>([
  readBookingError(new Error(NO_BOOKING)),
  readBookingError(null),
  "Reading bookings is paused until tomorrow",
  "Unsupported file type. Upload a PDF or image.",
]);

export function friendlyReadError(raw: unknown): string {
  const msg = typeof raw === "string" ? raw.trim() : "";
  if (FRIENDLY.has(msg)) return msg;
  // The daily-allowance line from lib/api/guard quotaExceeded.
  if (/^You've used today's allowance for [\w\s]+\. It resets at midnight UTC\.$/.test(msg)) return msg;
  return READ_FAILED;
}
