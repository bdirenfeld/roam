/**
 * A phone, on the server, by the client hint when the browser sends one,
 * else the user agent (26 Sep 2026). Used to open a journey on the week on a
 * computer and on the day on a phone; a tablet counts as a computer.
 */
export function isPhone(userAgent: string | null, chMobile: string | null): boolean {
  if (chMobile === "?1") return true;
  if (chMobile === "?0") return false;
  return /Mobi|iPhone|iPod|Android.*Mobile/i.test(userAgent ?? "");
}
