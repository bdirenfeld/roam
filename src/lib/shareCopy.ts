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
