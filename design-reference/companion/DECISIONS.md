# Roam · Companion — design decisions

A handoff snapshot. Read this first; the HTML files are the visual reference.

## What this is

An in-trip AI planning companion for Roam. A conversational chat the user
enters to **think alongside** while planning — explicitly a thinking
partner, never an autopilot. The user brings the thinking; the companion
amplifies.

Most of what it does is just talk: scoping, refining, advice, looking
things up, offering opinions. Talk needs no approval and no special UI.

It has **exactly three actions** that change the trip — Add, Cut
(reversible), Move card to a day. Every one passes a **confirm-before-write
gate**: the companion proposes, nothing changes until the user approves.

## Aesthetic system (non-negotiable)

| Token        | Value     | Notes                                         |
|--------------|-----------|-----------------------------------------------|
| Parchment    | `#FAF7F2` | Background                                    |
| Ink          | `#1A1A2E` | Primary text, primary button                  |
| Sienna       | `#C4622D` | Accent — small caps, "Roam." label, restore. **Never alarm/error.** |
| Display font | Playfair Display, **italic** | Headings, attributions, captions, lede |
| UI font      | DM Sans, 300–600 | Body, controls, place names               |
| Icons        | Phosphor, **weight=light** only | Never Heroicons, Lucide, or filled |

**Anti-goals:** sparkles, gradient glow on AI surfaces, rounded SaaS chat
bubbles, "✨ Ask AI" buttons, Sienna as alert color, anything that makes
the assistant the main character instead of the trip.

## The picks (after exploring forks)

| Decision           | Pick                                            |
|--------------------|-------------------------------------------------|
| Entry · mobile     | **1A · Editorial pull** (chapter-rule between day chips and map) |
| Entry · desktop    | **2A · Masthead link** (italic "Companion" + compass in top bar) |
| Container · mobile | **3A · Full-screen**                            |
| Container · desktop| **4A · Side panel, right** (trip stays visible) |
| Confirm gate       | **5 · Inline in chat** (proposal card mid-thread, not a modal) |

Common thread: the **trip** stays the main character, and the companion
stays in service to it. The entry doesn't shout; the container doesn't
displace the trip; the gate doesn't interrupt the conversation.

## The conversation surface

**Interview-transcript style** — no SaaS bubbles.

- **Speaker labels** — Playfair italic, period suffix. `Roam.` in Sienna,
  `You.` in caption gray. Sit above the body line.
- **Body** — DM Sans 15px, line-height 1.6, max width ~58ch.
- **Streaming** — a thin ink-block caret animates at the end of the
  current Roam paragraph (1s steps(2) blink).
- **Composer** — thin top rule, italic Playfair placeholder
  ("Think aloud with Roam…"), "Return to send" hint + ↵ glyph on the
  right. **No rounded field, no circle send button.**

### Response states

- **At rest** — caret only.
- **Looking up** — italic stage-direction notice, indented:
  *"reading tenement.org / calendar · · ·"*  (no spinner.)
- **Asks back** — Roam answers with a clarifying question instead of
  proposing. Critical for "thinking partner not autopilot."
- **With citation** — sienna underlined source line under the relevant
  reply: *"tenement.org / family-tours · checked just now"*

### Composer states

- **Typing** — text in DM Sans with caret; composer otherwise unchanged.
- **Attached card chip** — when the user drags a place into the chat, a
  small italic chip pins above the input scoping the conversation.
- **Day scope chip** — when companion opens from a specific day, a
  "Day 1 · Thursday" chip pins above the input.

## The confirm gate

The emotional core. Feels like a calm hand-off, not a bureaucratic alert.

**Composition (same for Add / Cut / Move):**

- Header: small-caps **About to [add | cut | move] · Day N · N places** (Sienna)
- Title: **italic Playfair lede in Roam's voice** explaining the move
- Rows: place cards — icon · KIND · name · meta. Plus mark (add) or minus
  mark (cut) at the right.
- Footer: italic reassurance + Approve / Discard
  - Add:  *"Nothing changes until you approve."*
  - Cut:  *"Reversible — restore any time."*
  - Move: *"Nothing locks until you approve."*

**Affordances:**

- **Approve** — quiet ink-filled button with a Phosphor check. The only
  filled button on the surface.
- **Discard** — text link only, caption color. **Not red.** Not a button.

**Move-specific:** the proposal shows a single row + a **day-arc strip**
beneath it — chips like `Day 1 · 2 PM` → `Day 2 · 10 AM` + an italic
clarifier ("Morning, before lunch").

**Cut-specific:**
- Items in the proposal are rendered at 0.72 opacity (telegraphs
  "about to disappear" without strikethrough — strikethrough reads punitive).
- Each row carries an italic *reason* line explaining the cut.
- After approval, the chat keeps an **ack card**: items shown at 0.55
  opacity with a thin strikethrough, plus a Sienna **Restore** link.
  Undo is one tap.

## After approval

- **Map** — five Sienna pins (numbered 1–5) drop into the Lower East
  Side, staggered 90ms apart.
- **Toast** — quiet ink-on-parchment band at the bottom of the map:
  *"5 places added to Day 2"* + italic Sienna **Undo**.
- **Chat** — the proposal card collapses into an ack frame with an
  **Undo** affordance pinned to the right.

## Reference scenario (used throughout)

User asks Roam to shape **Day 2** of a 4-day NYC trip around Mia (age 7,
likes craft, ate big yesterday). Roam proposes a Lower East Side day:

1. **Russ & Daughters Cafe** — breakfast, 10:00–11:30, 127 Orchard
2. **Wing on Wo & Co.** — porcelain & tea workshop, 12:30–2:00, Chinatown
3. **Tenement Museum** — family tour, 2:30–4:00, 103 Orchard
4. **Economy Candy** — snack, 4:15–4:45, 108 Rivington
5. **Wildair** — dinner, 7:00–9:00, 142 Orchard

This conversation is the canonical one used to compare gate placements
(inline vs sheet) and the one the walkthrough prototype plays.

## File map

| File | Purpose |
|------|---------|
| `Roam Companion.html` | Design canvas — all variations & static states |
| `Roam Companion Prototype.html` | Clickable walkthrough of the chosen flow |
| `companion-shared.jsx` | Palette, Phosphor icons, trip mockups, chat primitives, `ProposalCard` |
| `companion-entry.jsx` | Entry-point variants 1A–1D, 2A–2B |
| `companion-container.jsx` | Container forks 3A–3C, 4A–4C |
| `companion-gate.jsx` | Confirm-gate variants 5A–5B (inline), 6A–6B (sheet) |
| `companion-actions.jsx` | Cut + Move gate cards, after-cut ack |
| `companion-states.jsx` | Streaming notice, citation, composer chips |
| `companion-prototype.jsx` | The interactive walkthrough state machine |
| `design-canvas.jsx`, `ios-frame.jsx` | Layout scaffolding (pan/zoom canvas, iOS bezel) |

## Open questions for the next chat

- Where do **older conversations** live? In the chat surface (recent on
  top) or a separate "Notebook"?
- What's the **invocation pattern** when the user drags a card *into*
  the day from the place library — does Roam offer to scope a
  conversation around that drop?
- Cuts are "reversible" — but for how long? Forever, or session-only?
- The gate's "Discard" is silent — should it leave a chat trace
  ("Discarded — nothing moved"), or vanish? Prototype keeps the trace;
  worth a check.
