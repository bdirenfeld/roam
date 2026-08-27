// ── Card face badges ──────────────────────────────────────────────────────
// Trello's two card-face indicators, in this app's voice: how far through the
// card's checklist you are, and how many files are clipped to it.
//
// These are information, not decoration. Each one appears only when it has
// something to say — no checklist, no badge; no attachments, no paperclip —
// so a card with neither looks exactly as it did before this existed.
//
// The checklist count turns green when every item is ticked, the one moment a
// checklist is worth looking at from across the board. Green is the year
// view's "great" pair (#3F5D33 on #DCE8D4), reused rather than re-invented.

import type { Card } from "@/types/database";
import { checklistProgress } from "./cardChecklistModel";

const QUIET_INK = "rgba(26,26,46,0.45)";
const DONE_FG = "#3F5D33";
const DONE_BG = "#DCE8D4";

function CheckGlyph({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <polyline points="8 12.5 11 15.5 16 9" />
    </svg>
  );
}

function ClipGlyph({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/**
 * The badge row. Renders nothing at all — not an empty element — when the card
 * has neither a checklist nor attachments, so no card face pays for it in
 * whitespace.
 */
export default function CardBadges({ card, className = "" }: { card: Card; className?: string }) {
  const progress = checklistProgress(card.details);
  const attachments = card.attachment_count ?? 0;

  if (!progress && attachments < 1) return null;

  const complete = progress !== null && progress.done === progress.total;

  return (
    <div className={`flex items-center gap-2 ${className}`} style={{ fontFeatureSettings: '"tnum"' }}>
      {progress && (
        <span
          className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] text-[10.5px] font-medium leading-none"
          style={{
            color: complete ? DONE_FG : QUIET_INK,
            background: complete ? DONE_BG : "transparent",
            // A finished checklist gets a little breathing room inside its tint;
            // an unfinished one is bare text and must not shift when it fills.
            marginLeft: complete ? -4 : 0,
            paddingLeft: complete ? 5 : 0,
            paddingRight: complete ? 5 : 0,
          }}
          aria-label={`Checklist ${progress.done} of ${progress.total} done`}
        >
          <CheckGlyph color={complete ? DONE_FG : QUIET_INK} />
          {progress.done}/{progress.total}
        </span>
      )}
      {attachments > 0 && (
        <span
          className="inline-flex items-center gap-1 text-[10.5px] font-medium leading-none"
          style={{ color: QUIET_INK }}
          aria-label={`${attachments} attachment${attachments === 1 ? "" : "s"}`}
        >
          <ClipGlyph color={QUIET_INK} />
          {attachments}
        </span>
      )}
    </div>
  );
}
