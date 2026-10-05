/**
 * A phone, on the server, by the client hint when the browser sends one,
 * else the user agent (26 Sep 2026). Used to open a journey on the week on a
 * computer and on the day on a phone; a tablet counts as a computer.
 */
export function isPhone(userAgent: string | null, chMobile: string | null): boolean {
  // A phone user agent wins (5 Oct 2026). Real phones send both and they
  // agree; a phone emulator (the desktop app's browser pane) sends a phone
  // UA with "?0", and trusting the hint served it the computer's week, so
  // phone layouts could not be checked. "Desktop site" on a phone sends a
  // desktop UA, so it still gets the computer.
  if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(userAgent ?? "")) return true;
  return chMobile === "?1";
}
