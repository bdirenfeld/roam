// ── Card face badges ──────────────────────────────────────────────────────
// Trello's card-face indicators, in this app's voice: how far through the
// card's checklist you are, how many files are clipped to it, and whether the
// thing is actually booked.
//
// These are information, not decoration. Each one appears only when it has
// something to say — no checklist, no badge; no attachments, no paperclip —
// so a card with neither looks exactly as it did before this existed.
//
// The checklist count turns green when every item is ticked, the one moment a
// checklist is worth looking at from across the board. Green is the year
// view's "great" pair (#3F5D33 on #DCE8D4), reused rather than re-invented —
// and "Booked" borrows it, since both say the same thing: this one is done.
//
// Booked, and not its opposite, on purpose. Flagging what still needs booking
// was the obvious design and the wrong one: 68 of Brennan's 91 bookable cards
// are unbooked, so the badge would have sat on a third of the board and said
// nothing. 23 are confirmed. Draw the rare state; let absence mean the rest.

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

function TickGlyph({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 12.5 9.5 18 20 6" />
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
  // `confirmed` is only ever set on a card that can be booked — a flight, a
  // hotel, a restaurant, a guided thing — so it needs no second test here.
  const booked = card.confirmed === true;

  if (!progress && attachments < 1 && !booked) return null;

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
      {booked && (
        <span
          className="inline-flex items-center gap-1 rounded-[5px] px-[5px] py-[1px] text-[10.5px] font-medium leading-none"
          style={{ color: DONE_FG, background: DONE_BG }}
          aria-label="Booked"
        >
          <TickGlyph color={DONE_FG} />
          Booked
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
