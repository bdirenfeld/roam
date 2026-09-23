// ── Things that belong to one household, not to every user ────────────────
// "Your year" was built from Brennan's own life: his family's birthdays, the
// TDSB school calendar his kids follow, and the open windows those two make.
// Until 23 Sep 2026 every signed-in user with a dated journey saw all of it —
// his children's names and birthdays included. These pieces are now shown to
// his account only. When they become per-person (each user's own dates and
// school board), this is the one switch to replace.

export const HOUSEHOLD_OWNER_ID = "ece938aa-db7b-4436-bb59-442cc0dc5e10";

/** True only for the account whose household the personal calendar describes. */
export function isHouseholdOwner(userId: string | null | undefined): boolean {
  return !!userId && userId === HOUSEHOLD_OWNER_ID;
}
