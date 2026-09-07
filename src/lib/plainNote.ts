/**
 * Strip the markdown syntax out of a card note.
 *
 * Notes are typed into the card sheet, where a bit of markdown is habit —
 * `**Intent**`, `## Know before you go`, "- " bullets, "- [ ]" checkboxes on a
 * grocery list. The shared page shows notes as plain text, so the raw asterisks
 * would read as a bug.
 *
 * This strips syntax; it does not render markdown. Links, emphasis with single
 * asterisks, tables and everything else are left exactly as typed, because
 * nobody types them here and guessing would do more damage than the asterisks.
 */
export function plainNote(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    // Checkboxes before plain bullets: "- [ ] milk" must not become "• [ ] milk".
    .replace(/^\s*[-*]\s+\[[ xX]\]\s*/gm, "• ")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
