// ── What revoking a share link actually does, in words ─────────────────────
// Revoking nulls the link. People who already joined keep the journey —
// membership, not the link, is what lets them in (share-actions.ts). Until
// 23 Sep 2026 the screen said "Everyone loses access" and then hid the guest
// list, so the owner could neither see nor remove the people still inside.

function people(n: number): string {
  return n === 1 ? "The 1 person who joined" : `The ${n} people who joined`;
}

/** The inline confirmation beside the Revoke button. */
export function revokeWarning(joined: number): string {
  if (joined <= 0) return "The link stops working.";
  return `New people can't use the link. ${people(joined)} keep${joined === 1 ? "s" : ""} access.`;
}

/** The toast after a revoke succeeds. */
export function revokeToast(joined: number): string {
  if (joined <= 0) return "Link turned off.";
  return `Link turned off. ${people(joined)} still ${joined === 1 ? "has" : "have"} it — remove them below.`;
}

/** "Mar 4–12" / "Apr 30 – May 3" — the dates people check first. */
export function shortRange(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null;
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    ? `${m(s)} ${s.getDate()}–${e.getDate()}`
    : `${m(s)} ${s.getDate()} – ${m(e)} ${e.getDate()}`;
}

/**
 * The words of the invite email. It used to say "Open the link and sign in to
 * see the plan — the days, the map, the places": wrong twice over (no sign-in
 * is needed, and the map is behind one), and "sign in with Google" is where a
 * grandparent stops. It now says what the link is and that it just opens.
 */
export function inviteLines(sender: string, journey: string, start?: string | null, end?: string | null) {
  const dates = shortRange(start, end);
  const what = dates ? `${journey}, ${dates}` : journey;
  return {
    subject: `${sender} shared the plan for ${journey}`,
    lead: `Here’s the plan for ${what}.`,
    how: "Tap to open it — no account needed. It always shows the latest version.",
  };
}
